export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN ?? process.env.BETTER_AUTH_URL;
  if (!origin || !expected || new URL(origin).origin !== new URL(expected).origin) {
    throw new Error("Invalid request origin");
  }
}
