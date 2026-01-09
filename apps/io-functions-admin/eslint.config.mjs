import pagopa from "@pagopa/eslint-config";

export default [
  ...pagopa,
  {
    ignores: ["dist/**", "generated/**", "node_modules/**"]
  },
  {
    rules: {
      ...pagopa[2].rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_"
        }
      ],
      "vitest/no-conditional-expect": "off"
    }
  }
];
