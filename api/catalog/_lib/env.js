function getEnv() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length) {
    const err = new Error("Missing required environment variables: " + missing.join(", "));
    err.code = "ENV_MISSING";
    throw err;
  }

  return { url: url.replace(/\/+$/, ""), serviceRoleKey };
}

module.exports = { getEnv };
