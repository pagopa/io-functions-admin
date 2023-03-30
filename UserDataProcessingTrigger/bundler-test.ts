import { bundleWorkflowCode } from "@temporalio/worker";
import { writeFile } from "fs/promises";
import { join } from "path";

async function bundle() {
  const { code } = await bundleWorkflowCode({
    workflowsPath: require.resolve("../UserDataDownloadWorkflow/workflows.ts")
  });
  const codePath = join(__dirname, "./workflow-bundle.js");

  await writeFile(codePath, code);
  console.log(`Bundle written to ${codePath}`);
}

bundle().catch(err => {
  console.error(err);
  process.exit(1);
});
