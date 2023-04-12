import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "../UserDataDownloadWorkflow/activities/activities";

async function run() {
  // Step 1: Register Workflows and Activities with the Worker and connect to
  // the Temporal server.
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS
  });
  const worker = await Worker.create({
    workflowsPath: require.resolve("../UserDataDownloadWorkflow/workflows.ts"),
    taskQueue: "userDataDownloadQueue",
    activities,
    connection
  });

  // Worker connects to localhost by default and uses console.error for logging.
  // Customize the Worker by passing more options to create():
  // https://typescript.temporal.io/api/classes/worker.Worker
  // If you need to configure server connection parameters, see docs:
  // https://docs.temporal.io/typescript/security#encryption-in-transit-with-mtls

  // Step 2: Start accepting tasks on the `hello-world` queue
  await worker.run();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
