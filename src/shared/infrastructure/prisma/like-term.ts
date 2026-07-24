/**
 * Prisma's `contains` / `startsWith` / `endsWith` compile to `LIKE '%' || $n || '%'`.
 * The term is bound as a parameter, so there is no SQL injection - but the parameter
 * IS the pattern, and Prisma does not escape the pattern metacharacters inside it.
 *
 * Verified against Prisma 7.7.0 + @prisma/adapter-pg on Postgres 17: searching
 * `PROBE%beta` matches the title "ESCAPE-PROBE alpha beta", which contains no such
 * substring, and `PROB_ alpha` matches it too. So a user-supplied search term silently
 * behaves as a wildcard pattern.
 *
 * Two consequences, both fixed by escaping:
 *  - wrong results: a search for the literal "100%" or "a_b" over-matches
 *  - cost: Postgres' LIKE matcher backtracks, so a term dense in `%` can be made far
 *    more expensive to evaluate than its length suggests
 *
 * `\` must be escaped first, or it would double-escape the escapes this adds.
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}
