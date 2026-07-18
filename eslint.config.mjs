// @ts-check

import zotero from "@zotero-plugin/eslint-config";

export default zotero({
  overrides: [
    {
      files: ["**/*.ts"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            caughtErrors: "all",
            caughtErrorsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
          },
        ],
      },
    },
    {
      files: ["addon/**/*.js"],
      languageOptions: {
        globals: {
          Components: "readonly",
          Services: "readonly",
          Zotero: "readonly",
          document: "readonly",
          window: "readonly",
        },
      },
      rules: {
        "no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            caughtErrors: "all",
            caughtErrorsIgnorePattern: "^_",
          },
        ],
      },
    },
    {
      files: ["addon/bootstrap.js"],
      rules: {
        "no-unused-vars": "off",
      },
    },
    {
      files: ["test-zotero/**/*.js"],
      languageOptions: {
        globals: {
          Zotero: "readonly",
          assert: "readonly",
          describe: "readonly",
          it: "readonly",
        },
      },
    },
  ],
});
