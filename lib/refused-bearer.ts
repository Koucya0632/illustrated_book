// Whether a request presented a bearer token.
//
// The proxy (lib/supabase/middleware.ts) validates a bearer token and, when
// Supabase refuses it, falls through to the cookie path. So a route handler
// sees "no user" in two different situations: a signed-out web visitor, and an
// app whose token has expired. A read that answers "no user" with an empty
// list cannot tell them apart — and for the app, the empty list is wrong twice
// over: it is not the account's data, and it is a 200, so the client's 401
// retry, which would have refreshed the token, never runs. 熟練度 stayed empty
// for the whole session on a phone whose clock had drifted.
//
// A route that serves both keeps the empty answer for a caller that sent no
// token, and says 401 to one whose token was refused.

export function presentsBearerToken(req: Request): boolean {
  const header = req.headers.get("authorization");
  return header != null && /^Bearer\s+\S/i.test(header);
}
