/**
 * Shared commitlint configuration: Conventional Commits with the limits that fit squash-merge
 * workflows (the pull request title becomes the commit subject).
 *
 *   // commitlint.config.mjs
 *   export { default } from '@valentinbrclz/web-standards/commitlint';
 *
 * Requires `@commitlint/cli` and `@commitlint/config-conventional` in the project.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Subjects are short; the body explains why. Allowed scope is free (`cli`, `init`, `deps`).
    'header-max-length': [2, 'always', 100],
    // Dependabot bodies, links and trailers (Co-Authored-By, Claude-Session) are not wrapped.
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
