import pagopa from "@pagopa/eslint-config";

export default [
  ...pagopa,
  {
    ignores: ["dist/**", "generated/**", "node_modules/**"]
  }
];
