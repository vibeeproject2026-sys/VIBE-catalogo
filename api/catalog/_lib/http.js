function sendJson(res, status, payload) {
  return res.status(status).json(payload);
}

function sendError(res, status, message, logDetail) {
  if (logDetail) console.error(logDetail);
  return sendJson(res, status, { error: message });
}

function methodNotAllowed(res, allowed = ["GET", "OPTIONS"]) {
  res.setHeader("Allow", allowed.join(", "));
  return sendJson(res, 405, { error: "Method not allowed" });
}

module.exports = { sendJson, sendError, methodNotAllowed };
