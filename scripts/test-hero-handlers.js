// Runs with plain Node, no network, no real credentials:
//   node scripts/test-hero-handlers.js
//
// Invokes the real exported handlers (api/hero/slides.js,
// api/admin/hero-slides.js, api/admin/hero-slide-image.js) against a
// stateful in-memory mock of Supabase Storage (GET/POST/DELETE on
// hero/slides.json and hero/{id}/*), same pattern as
// test-admin-images-handlers.js. No real Storage/Supabase call is ever
// made.

const assert = require("assert/strict");

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ok - " + name);
  } catch (e) {
    failed++;
    console.error("  FAIL - " + name);
    console.error("    " + e.message);
  }
}

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  Object.assign(process.env, vars);
  return (async () => {
    try {
      return await fn();
    } finally {
      for (const k of Object.keys(saved)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  })();
}

// Stateful mock: un único bucket en memoria (path -> Buffer), igual a
// como se comporta Supabase Storage para GET (download autenticado),
// POST (upload/x-upsert) y DELETE.
function mockStorage(initialFiles = {}) {
  const store = new Map(Object.entries(initialFiles));
  const calls = { uploads: [], deletes: [] };
  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || "GET";
    const m = url.match(/\/storage\/v1\/object\/product-images\/(.+)$/);
    if (!m) throw new Error("URL de storage inesperada en el mock: " + url);
    // Fase 36 — downloadObject ahora agrega un query string de
    // cache-busting (ver storage.js); Storage real ignora la query al
    // resolver el objeto, así que el mock hace lo mismo.
    const path = m[1].split("?")[0];
    if (method === "GET") {
      // Comportamiento real confirmado contra Supabase Storage (Fase
      // 33): un objeto inexistente responde HTTP 400, no 404 — el "404"
      // real viaja como string dentro del cuerpo JSON.
      if (!store.has(path)) {
        return {
          ok: false,
          status: 400,
          text: async () => JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found", code: "NoSuchKey" }),
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }
      const buf = store.get(path);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        text: async () => buf.toString("utf8"),
      };
    }
    if (method === "DELETE") {
      calls.deletes.push(path);
      const existed = store.delete(path);
      return { ok: existed, status: existed ? 200 : 404, text: async () => "" };
    }
    // POST = upload
    calls.uploads.push({ path, contentType: opts.headers && opts.headers["Content-Type"] });
    store.set(path, Buffer.isBuffer(opts.body) ? opts.body : Buffer.from(opts.body));
    return { ok: true, status: 200, text: async () => "" };
  };
  return { fetchImpl, store, calls };
}

function makePng(width, height) {
  const buf = Buffer.alloc(33);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}
const VALID_DESKTOP_PNG_B64 = makePng(1600, 900).toString("base64");
const VALID_MOBILE_PNG_B64 = makePng(1080, 1350).toString("base64");
const TOO_SMALL_PNG_B64 = makePng(10, 10).toString("base64");

const BASE_ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-real",
  ADMIN_API_TOKEN: "admin-test-token",
};
const AUTH = { authorization: "Bearer admin-test-token" };

async function main() {
  const adminHandler = require("../api/admin/hero-slides");
  const imageHandler = require("../api/admin/hero-slide-image");
  const publicHandler = require("../api/hero/slides");

  console.log("autorización (endpoints administrativos)");

  await test("GET /api/admin/hero-slides sin token -> 401", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const res = mockRes();
        await adminHandler({ method: "GET", headers: {}, query: {} }, res);
        assert.equal(res.statusCode, 401);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("el endpoint público NUNCA exige token (no llama a requireAdmin)", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const res = mockRes();
        await publicHandler({ method: "GET", headers: {}, query: {} }, res);
        assert.equal(res.statusCode, 200);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\nausencia de slides (sección 6/18 — nunca rompe, nunca inventa)");

  await test("sin manifiesto todavía (404 en Storage) -> API pública devuelve slides: []", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const res = mockRes();
        await publicHandler({ method: "GET", headers: {}, query: {} }, res);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body.slides, []);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\ncreación");

  await test("POST crea un slide inactivo por defecto, con order asignado", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const res = mockRes();
        await adminHandler({ method: "POST", headers: AUTH, body: { title: "Nueva colección", name: "Producto falso", price: 1 } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.slide.active, false);
        assert.equal(res.body.slide.order, 1);
        assert.equal(res.body.slide.title, "Nueva colección");
        assert.equal("name" in res.body.slide, false);
        assert.equal("price" in res.body.slide, false);
        assert.equal(calls.uploads.length, 1);
        assert.equal(calls.uploads[0].path, "hero/slides.json");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("un slide recién creado no aparece en el endpoint público (inactivo por defecto)", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        await adminHandler({ method: "POST", headers: AUTH, body: { title: "X" } }, mockRes());
        const res = mockRes();
        await publicHandler({ method: "GET", headers: {}, query: {} }, res);
        assert.deepEqual(res.body.slides, []);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\nCTA (sección 7)");

  await test("ctaHref peligroso (javascript:) -> 400, no se crea el slide", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const res = mockRes();
        await adminHandler({ method: "POST", headers: AUTH, body: { title: "X", ctaHref: "javascript:alert(1)" } }, res);
        assert.equal(res.statusCode, 400);
        assert.equal(calls.uploads.length, 0);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("ctaHref interno (#catalogo) se acepta y se refleja en el endpoint público", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const createRes = mockRes();
        await adminHandler({ method: "POST", headers: AUTH, body: { title: "X", ctaText: "Explorar", ctaHref: "#catalogo" } }, createRes);
        await adminHandler({ method: "PATCH", headers: AUTH, body: { id: createRes.body.slide.id, active: true } }, mockRes());
        const res = mockRes();
        await publicHandler({ method: "GET", headers: {}, query: {} }, res);
        assert.equal(res.body.slides[0].ctaHref, "#catalogo");
        assert.equal(res.body.slides[0].ctaText, "Explorar");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\nedición y activo/inactivo");

  await test("PATCH activo:true hace que el slide aparezca en el endpoint público", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const createRes = mockRes();
        await adminHandler({ method: "POST", headers: AUTH, body: { title: "Slide de prueba" } }, createRes);
        const id = createRes.body.slide.id;
        await adminHandler({ method: "PATCH", headers: AUTH, body: { id, active: true } }, mockRes());
        const res = mockRes();
        await publicHandler({ method: "GET", headers: {}, query: {} }, res);
        assert.equal(res.body.slides.length, 1);
        assert.equal(res.body.slides[0].title, "Slide de prueba");

        // editar -> el Home debe reflejar el cambio inmediatamente
        await adminHandler({ method: "PATCH", headers: AUTH, body: { id, title: "Título editado" } }, mockRes());
        const res2 = mockRes();
        await publicHandler({ method: "GET", headers: {}, query: {} }, res2);
        assert.equal(res2.body.slides[0].title, "Título editado");

        // desactivar -> desaparece
        await adminHandler({ method: "PATCH", headers: AUTH, body: { id, active: false } }, mockRes());
        const res3 = mockRes();
        await publicHandler({ method: "GET", headers: {}, query: {} }, res3);
        assert.deepEqual(res3.body.slides, []);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("PATCH sobre un id inexistente -> 404", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const res = mockRes();
        await adminHandler({ method: "PATCH", headers: AUTH, body: { id: "no-existe", title: "X" } }, res);
        assert.equal(res.statusCode, 404);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\norden / múltiples slides");

  await test("varios slides activos se devuelven ordenados por order", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const ids = [];
        for (const title of ["Uno", "Dos", "Tres"]) {
          const r = mockRes();
          await adminHandler({ method: "POST", headers: AUTH, body: { title } }, r);
          ids.push(r.body.slide.id);
        }
        // activar todos, orden inicial 1,2,3 (creación)
        for (const id of ids) await adminHandler({ method: "PATCH", headers: AUTH, body: { id, active: true } }, mockRes());
        // reordenar: mover el último (Tres, order 3) al frente (order 0)
        await adminHandler({ method: "PATCH", headers: AUTH, body: { id: ids[2], order: 0 } }, mockRes());

        const res = mockRes();
        await publicHandler({ method: "GET", headers: {}, query: {} }, res);
        assert.deepEqual(res.body.slides.map((s) => s.title), ["Tres", "Uno", "Dos"]);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  // Fase 36 — antes, mover una fila en Admin hacía dos PATCH secuenciales
  // (uno por slide), cada uno su propio read-modify-write del manifiesto
  // completo: el segundo request podía basarse en una copia que no
  // incluía lo que el primero acababa de guardar y perder ese cambio
  // (lost update). PATCH { reorder: [...] } aplica ambos `order` en un
  // único read-modify-write, así que no hay ventana entre medio.
  await test("PATCH { reorder } aplica varios order en un único read-modify-write (fix del bug de reordenar)", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const ids = [];
        for (const title of ["Uno", "Dos"]) {
          const r = mockRes();
          await adminHandler({ method: "POST", headers: AUTH, body: { title } }, r);
          ids.push(r.body.slide.id);
        }
        const [idUno, idDos] = ids;

        const res = mockRes();
        await adminHandler(
          {
            method: "PATCH",
            headers: AUTH,
            body: {
              reorder: [
                { id: idUno, order: 2 },
                { id: idDos, order: 1 },
              ],
            },
          },
          res
        );
        assert.equal(res.statusCode, 200);
        const byId = Object.fromEntries(res.body.slides.map((s) => [s.id, s.order]));
        assert.equal(byId[idUno], 2);
        assert.equal(byId[idDos], 1);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("PATCH { reorder } con un id inexistente -> 404, no guarda ningún cambio", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const createRes = mockRes();
        await adminHandler({ method: "POST", headers: AUTH, body: { title: "Real" } }, createRes);
        const realId = createRes.body.slide.id;

        const res = mockRes();
        await adminHandler(
          {
            method: "PATCH",
            headers: AUTH,
            body: {
              reorder: [
                { id: realId, order: 5 },
                { id: "no-existe", order: 6 },
              ],
            },
          },
          res
        );
        assert.equal(res.statusCode, 404);

        const check = mockRes();
        await adminHandler({ method: "GET", headers: AUTH, body: {} }, check);
        assert.notEqual(check.body.slides.find((s) => s.id === realId).order, 5);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\nupload de imagen (desktop y mobile)");

  await test("upload desktop válido actualiza slide.image y aparece en el endpoint público al activar", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const createRes = mockRes();
        await adminHandler({ method: "POST", headers: AUTH, body: { title: "Con imagen" } }, createRes);
        const id = createRes.body.slide.id;

        const imgRes = mockRes();
        await imageHandler({ method: "POST", headers: AUTH, body: { slide_id: id, slot: "desktop", contentType: "image/png", dataBase64: VALID_DESKTOP_PNG_B64 } }, imgRes);
        assert.equal(imgRes.statusCode, 200);
        assert.ok(String(imgRes.body.slide.image).includes(`hero/${id}/main.png`));
        assert.ok(calls.uploads.some((u) => u.path === `hero/${id}/main.png`));

        await adminHandler({ method: "PATCH", headers: AUTH, body: { id, active: true } }, mockRes());
        const res = mockRes();
        await publicHandler({ method: "GET", headers: {}, query: {} }, res);
        assert.ok(String(res.body.slides[0].image).includes("main.png"));
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("upload mobile válido actualiza slide.mobileImage por separado (no pisa image)", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const createRes = mockRes();
        await adminHandler({ method: "POST", headers: AUTH, body: { title: "X" } }, createRes);
        const id = createRes.body.slide.id;
        await imageHandler({ method: "POST", headers: AUTH, body: { slide_id: id, slot: "desktop", contentType: "image/png", dataBase64: VALID_DESKTOP_PNG_B64 } }, mockRes());
        const mobileRes = mockRes();
        await imageHandler({ method: "POST", headers: AUTH, body: { slide_id: id, slot: "mobile", contentType: "image/png", dataBase64: VALID_MOBILE_PNG_B64 } }, mobileRes);
        assert.equal(mobileRes.statusCode, 200);
        assert.ok(String(mobileRes.body.slide.mobileImage).includes(`hero/${id}/mobile.png`));
        assert.ok(String(mobileRes.body.slide.image).includes(`hero/${id}/main.png`)); // no se perdió
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("reemplazo de imagen desktop: borra la anterior (propia) best-effort", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const createRes = mockRes();
        await adminHandler({ method: "POST", headers: AUTH, body: { title: "X" } }, createRes);
        const id = createRes.body.slide.id;
        await imageHandler({ method: "POST", headers: AUTH, body: { slide_id: id, slot: "desktop", contentType: "image/png", dataBase64: makePng(1600, 900).toString("base64") } }, mockRes());
        // segunda subida en el mismo slot: distinto ancho para forzar un archivo "distinto" conceptualmente (misma extensión .png -> mismo path, así que en este caso el upsert simplemente sobreescribe, sin delete)
        // probamos el caso real de reemplazo cambiando de formato (png -> jpeg cambia el path)
        const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]);
        jpegBuf.writeUInt16BE(900, 7);
        jpegBuf.writeUInt16BE(1600, 9);
        await imageHandler({ method: "POST", headers: AUTH, body: { slide_id: id, slot: "desktop", contentType: "image/jpeg", dataBase64: jpegBuf.toString("base64") } }, mockRes());
        await new Promise((r) => setImmediate(r));
        assert.ok(calls.deletes.includes(`hero/${id}/main.png`));
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  // Fase 36 — el bug real reportado ("reemplazar imagen no funciona"):
  // reemplazar con el MISMO slot/extensión sube al mismo path (x-upsert
  // sobreescribe), así que sin un cache-buster la URL pública devuelta era
  // literalmente idéntica a la anterior — navegador y CDN seguían
  // sirviendo el archivo viejo bajo esa misma URL indefinidamente. La URL
  // guardada ahora lleva "?v=<timestamp>", que cambia en cada subida.
  await test("reemplazo de imagen con MISMO slot/extensión: la URL devuelta cambia (cache-busting), aunque el path real sea el mismo", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const createRes = mockRes();
        await adminHandler({ method: "POST", headers: AUTH, body: { title: "X" } }, createRes);
        const id = createRes.body.slide.id;

        const first = mockRes();
        await imageHandler({ method: "POST", headers: AUTH, body: { slide_id: id, slot: "desktop", contentType: "image/png", dataBase64: makePng(1600, 900).toString("base64") } }, first);
        const second = mockRes();
        await imageHandler({ method: "POST", headers: AUTH, body: { slide_id: id, slot: "desktop", contentType: "image/png", dataBase64: makePng(1400, 1000).toString("base64") } }, second);

        assert.notEqual(first.body.slide.image, second.body.slide.image, "la URL debe cambiar entre reemplazos aunque el path de Storage sea el mismo");
        // el path real (sin query) debe seguir siendo el mismo objeto — no se creó basura nueva
        assert.ok(first.body.slide.image.includes(`hero/${id}/main.png`));
        assert.ok(second.body.slide.image.includes(`hero/${id}/main.png`));
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("upload con dimensiones bajo el mínimo -> 422, no se toca el slide", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const createRes = mockRes();
        await adminHandler({ method: "POST", headers: AUTH, body: { title: "X" } }, createRes);
        const id = createRes.body.slide.id;
        const before = calls.uploads.length;
        const res = mockRes();
        await imageHandler({ method: "POST", headers: AUTH, body: { slide_id: id, slot: "desktop", contentType: "image/png", dataBase64: TOO_SMALL_PNG_B64 } }, res);
        assert.equal(res.statusCode, 422);
        assert.equal(calls.uploads.length, before); // no nuevo upload (ni de imagen ni de manifiesto)
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("upload para un slide_id inexistente -> 400, nunca sube a Storage", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const res = mockRes();
        await imageHandler({ method: "POST", headers: AUTH, body: { slide_id: "no-existe", slot: "desktop", contentType: "image/png", dataBase64: VALID_DESKTOP_PNG_B64 } }, res);
        assert.equal(res.statusCode, 400);
        assert.equal(calls.uploads.length, 0);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\npropagación retrasada de Storage (Fase 34, sección 12 — corrige 'Ese slide_id no existe.')");

  await test("si el slide recién creado no aparece todavía en la primera lectura, reintenta y el upload igual funciona", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockStorage();
      const originalFetch = global.fetch;
      let getCount = 0;
      // Envuelve el mock para que las primeras 2 lecturas de
      // hero/slides.json devuelvan un manifiesto vacío (como si el
      // create todavía no se hubiera propagado), y de la 3ra en adelante
      // sí devuelvan el contenido real ya escrito.
      global.fetch = async (url, opts = {}) => {
        const method = opts.method || "GET";
        if (url.includes("hero/slides.json") && method === "GET") {
          getCount++;
          if (getCount <= 2) {
            return { ok: true, status: 200, arrayBuffer: async () => Buffer.from("[]").buffer.slice(0, 2), text: async () => "[]" };
          }
        }
        return fetchImpl(url, opts);
      };
      try {
        const createRes = mockRes();
        await adminHandler({ method: "POST", headers: AUTH, body: { title: "X" } }, createRes);
        const id = createRes.body.slide.id;

        const imgRes = mockRes();
        await imageHandler({ method: "POST", headers: AUTH, body: { slide_id: id, slot: "desktop", contentType: "image/png", dataBase64: VALID_DESKTOP_PNG_B64 } }, imgRes);
        assert.equal(imgRes.statusCode, 200, "no debería fallar con 'Ese slide_id no existe.' aunque las primeras lecturas estén desactualizadas");
        assert.ok(getCount >= 3, "debería haber reintentado al menos una vez");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\neliminación");

  await test("DELETE elimina el slide del manifiesto y limpia sus imágenes propias", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const createRes = mockRes();
        await adminHandler({ method: "POST", headers: AUTH, body: { title: "A borrar" } }, createRes);
        const id = createRes.body.slide.id;
        await imageHandler({ method: "POST", headers: AUTH, body: { slide_id: id, slot: "desktop", contentType: "image/png", dataBase64: VALID_DESKTOP_PNG_B64 } }, mockRes());

        const res = mockRes();
        await adminHandler({ method: "DELETE", headers: AUTH, body: { id } }, res);
        await new Promise((r) => setImmediate(r));
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.slides.find((s) => s.id === id), undefined);
        assert.ok(calls.deletes.includes(`hero/${id}/main.png`));

        const listRes = mockRes();
        await adminHandler({ method: "GET", headers: AUTH, query: {} }, listRes);
        assert.equal(listRes.body.slides.length, 0);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("DELETE de un id inexistente -> 404, no toca Storage", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockStorage();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const res = mockRes();
        await adminHandler({ method: "DELETE", headers: AUTH, body: { id: "no-existe" } }, res);
        assert.equal(res.statusCode, 404);
        assert.equal(calls.deletes.length, 0);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
