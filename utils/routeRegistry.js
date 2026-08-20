const routes = [];

/**
 * Mendeteksi parameter yang digunakan di dalam handler.
 *
 * Pola yang didukung antara lain:
 * - req.params.id
 * - req.query.search
 * - req.body.name
 * - const { id } = req.params
 * - const { search, page } = req.query
 * - const { name, email } = req.body
 */
function extractRequestParameters(handler) {
  const source = handler.toString();

  const result = {
    path: new Set(),
    query: new Set(),
    body: new Set()
  };

  const types = {
    params: "path",
    query: "query",
    body: "body"
  };

  for (const [requestProperty, outputProperty] of Object.entries(types)) {
    let match;

    // Contoh: req.query.search
    const dotRegex = new RegExp(
      `req\\.${requestProperty}\\.([a-zA-Z_$][\\w$]*)`,
      "g"
    );

    while ((match = dotRegex.exec(source)) !== null) {
      result[outputProperty].add(match[1]);
    }

    // Contoh: req.query["search"] / req.query['search']
    const bracketRegex = new RegExp(
      `req\\.${requestProperty}\\[['\"]([^'\"]+)['\"]\\]`,
      "g"
    );

    while ((match = bracketRegex.exec(source)) !== null) {
      result[outputProperty].add(match[1]);
    }

    // Contoh: const { search, page } = req.query
    const destructuringRegex = new RegExp(
      `(?:const|let|var)\\s*\\{([^}]+)\\}\\s*=\\s*req\\.${requestProperty}`,
      "g"
    );

    while ((match = destructuringRegex.exec(source)) !== null) {
      const properties = match[1]
        .split(",")
        .map((item) => item.trim())
        .map((item) => item.split("=")[0])
        .map((item) => item.split(":")[0])
        .map((item) => item.trim())
        .filter(Boolean);

      for (const property of properties) {
        result[outputProperty].add(property);
      }
    }
  }

  return {
    path: [...result.path],
    query: [...result.query],
    body: [...result.body]
  };
}

/**
 * Mengambil parameter dari path Express.
 * Contoh: /api/products/:productId -> ["productId"]
 */
function extractPathParameters(path) {
  const params = [];
  const regex = /:([a-zA-Z0-9_]+)/g;

  let match;

  while ((match = regex.exec(path)) !== null) {
    params.push(match[1]);
  }

  return params;
}

/**
 * Mendaftarkan route ke Express sekaligus ke registry dokumentasi.
 */
export function registerRoute({
  app,
  method,
  path,
  handler,
  description = null,
  category = "other"
}) {
  if (!app) {
    throw new Error("app wajib diberikan");
  }

  if (!method) {
    throw new Error("method wajib diberikan");
  }

  if (!path) {
    throw new Error("path wajib diberikan");
  }

  if (typeof handler !== "function") {
    throw new Error("handler harus berupa function");
  }

  const normalizedMethod = method.toLowerCase();

  if (typeof app[normalizedMethod] !== "function") {
    throw new Error(`HTTP method tidak didukung: ${method}`);
  }

  const detectedParams = extractRequestParameters(handler);
  const pathParams = extractPathParameters(path);

  const parameters = {
    path: [...new Set([...pathParams, ...detectedParams.path])],
    query: [...new Set(detectedParams.query)],
    body: [...new Set(detectedParams.body)]
  };

  routes.push({
    method: normalizedMethod.toUpperCase(),
    path,
    description,
    category,
    parameters
  });

  app[normalizedMethod](path, handler);
}

/**
 * Mengembalikan salinan daftar route agar registry tidak dapat
 * dimodifikasi langsung dari luar module.
 */
export function getRegisteredRoutes() {
  return routes.map((route) => ({
    ...route,
    parameters: {
      path: [...route.parameters.path],
      query: [...route.parameters.query],
      body: [...route.parameters.body]
    }
  }));
}
