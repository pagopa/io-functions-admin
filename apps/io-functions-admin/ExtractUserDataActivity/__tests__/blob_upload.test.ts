import type { TokenCredential } from "@azure/core-auth";
import type { BlobServiceClient } from "@azure/storage-blob";
import type { IncomingHttpHeaders, ServerResponse } from "node:http";

import * as E from "fp-ts/lib/Either";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import * as https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buffer } from "node:stream/consumers";
import { setTimeout as delay } from "node:timers/promises";
import * as tls from "node:tls";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// eslint-disable-next-line vitest/no-mocks-import
import { aProfile } from "../../__mocks__/mocks";
import {
  createBlobServiceClient as createBlobServiceClientWithPolicy,
  isBlobNotFoundError
} from "../../utils/blob_storage";
import { StrongPassword } from "../../utils/random";
import { AllUserData } from "../../utils/userData";
import { saveDataToBlob } from "../handler";

interface BlobTestServer {
  readonly close: () => Promise<void>;
  readonly endpoint: string;
  readonly requests: CapturedRequest[];
}

interface CapturedRequest {
  readonly body: Buffer;
  readonly headers: IncomingHttpHeaders;
  readonly method: string;
  readonly url: string;
}

type RequestHandler = (
  request: CapturedRequest,
  response: ServerResponse
) => Promise<void> | void;

interface TestCertificate {
  readonly cert: string;
  readonly key: string;
}

const execFileAsync = promisify(execFile);
const originalCertificateAuthorities = https.globalAgent.options.ca;
let temporaryTlsDirectory: string | undefined;
let testCertificate: TestCertificate | undefined;

beforeAll(async () => {
  temporaryTlsDirectory = await mkdtemp(
    join(tmpdir(), "io-functions-admin-blob-test-")
  );
  const certificatePath = join(temporaryTlsDirectory, "certificate.pem");
  const privateKeyPath = join(temporaryTlsDirectory, "private-key.pem");
  await execFileAsync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    privateKeyPath,
    "-out",
    certificatePath,
    "-days",
    "2",
    "-subj",
    "/CN=127.0.0.1",
    "-addext",
    "subjectAltName=IP:127.0.0.1"
  ]);

  const cert = await readFile(certificatePath, "utf8");
  const key = await readFile(privateKeyPath, "utf8");
  testCertificate = { cert, key };
  const existingCertificateAuthorities =
    originalCertificateAuthorities === undefined
      ? tls.rootCertificates
      : Array.isArray(originalCertificateAuthorities)
        ? originalCertificateAuthorities
        : [originalCertificateAuthorities];
  https.globalAgent.options.ca = [...existingCertificateAuthorities, cert];
});

afterAll(async () => {
  https.globalAgent.options.ca = originalCertificateAuthorities;
  if (temporaryTlsDirectory !== undefined) {
    await rm(temporaryTlsDirectory, { force: true, recursive: true });
  }
});

const createBlobTestServer = async (
  handleRequest: RequestHandler
): Promise<BlobTestServer> => {
  if (testCertificate === undefined) {
    throw new Error("Blob test server certificate has not been initialized");
  }

  const requests: CapturedRequest[] = [];
  const server = createServer(testCertificate, (request, response) => {
    void buffer(request)
      .then(async body => {
        const capturedRequest: CapturedRequest = {
          body,
          headers: request.headers,
          method: request.method ?? "",
          url: request.url ?? "/"
        };
        requests.push(capturedRequest);
        await handleRequest(capturedRequest, response);
      })
      .catch(error =>
        response.destroy(
          error instanceof Error ? error : new Error(String(error))
        )
      );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Blob test server did not bind to a TCP port");
  }

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
    endpoint: `https://127.0.0.1:${address.port}/devstoreaccount1`,
    requests
  };
};

const withBlobTestServer = async <T>(
  handleRequest: RequestHandler,
  run: (server: BlobTestServer) => Promise<T>
): Promise<T> => {
  const server = await createBlobTestServer(handleRequest);
  try {
    return await run(server);
  } finally {
    await server.close();
  }
};

const sendResponse = (
  response: ServerResponse,
  status: number,
  body: Buffer | string = "",
  headers: Record<string, string> = {}
): void => {
  response.writeHead(status, {
    "x-ms-request-id": "blob-test-request",
    "x-ms-version": "2025-07-05",
    ...headers
  });
  response.end(body);
};

const sendStorageError = (
  response: ServerResponse,
  status: number,
  code: string
): void =>
  sendResponse(
    response,
    status,
    `<Error><Code>${code}</Code><Message>Request denied.</Message></Error>`,
    {
      "content-type": "application/xml",
      "x-ms-error-code": code
    }
  );

const sendUploadSuccess = (response: ServerResponse): void =>
  sendResponse(response, 201, "", {
    etag: '"0x8DB000000000000"',
    "last-modified": new Date(0).toUTCString(),
    "x-ms-request-server-encrypted": "true"
  });

const getComp = (request: CapturedRequest): null | string =>
  new URL(request.url, "http://127.0.0.1").searchParams.get("comp");

const containerName = "user-data-download";
const archivePassword = "test-password-1234" as StrongPassword;
const archiveData: AllUserData = {
  messageContents: [],
  messages: [],
  messageStatuses: [],
  messagesView: [],
  notifications: [],
  notificationStatuses: [],
  profiles: [aProfile],
  servicesPreferences: []
};

function createTokenCredential(): TokenCredential {
  return {
    getToken: async scopes => {
      const requestedScopes = Array.isArray(scopes) ? scopes : [scopes];
      if (!requestedScopes.includes("https://storage.azure.com/.default")) {
        throw new Error("Unexpected Azure Storage token scope");
      }
      return {
        expiresOnTimestamp: Date.now() + 60 * 60 * 1000,
        token: "synthetic-storage-token"
      };
    }
  };
}

const tokenAuthorization = /^Bearer /;

const createBlobServiceClient = (
  endpoint: string,
  credential: TokenCredential
): BlobServiceClient =>
  createBlobServiceClientWithPolicy(endpoint, credential, {
    keepAliveOptions: { enable: false }
  });

describe("GDPR archive upload with TokenCredential authentication", () => {
  it("uploads ZIP bytes and commits the staged block list", async () => {
    await withBlobTestServer(
      (_request, response) => sendUploadSuccess(response),
      async ({ endpoint, requests }) => {
        const result = await saveDataToBlob(
          createBlobServiceClient(endpoint, createTokenCredential()),
          containerName,
          archiveData,
          archivePassword
        )();

        expect(E.isRight(result)).toBe(true);
        if (E.isLeft(result)) {
          return;
        }

        const stagedBlock = requests.find(
          request => getComp(request) === "block"
        );
        const committedBlockList = requests.find(
          request => getComp(request) === "blocklist"
        );

        expect(stagedBlock).toBeDefined();
        expect(committedBlockList).toBeDefined();
        expect(stagedBlock?.body.subarray(0, 4)).toEqual(
          Buffer.from([0x50, 0x4b, 0x03, 0x04])
        );
        expect(stagedBlock?.headers["x-ms-version"]).toBeDefined();
        expect(committedBlockList?.headers["x-ms-version"]).toBeDefined();
        expect(committedBlockList?.body.toString("utf8")).toContain(
          "<BlockList>"
        );
        expect(committedBlockList?.body.toString("utf8")).toMatch(
          /<(Latest|Committed|Uncommitted)>[^<]+<\/(Latest|Committed|Uncommitted)>/
        );
        expect(stagedBlock?.headers.authorization).toMatch(tokenAuthorization);
      }
    );
  });

  it("fails the archive and skips commit when staging a block returns 403", async () => {
    await withBlobTestServer(
      (request, response) =>
        getComp(request) === "block"
          ? sendStorageError(response, 403, "AuthorizationPermissionMismatch")
          : sendUploadSuccess(response),
      async ({ endpoint, requests }) => {
        const result = await saveDataToBlob(
          createBlobServiceClient(endpoint, createTokenCredential()),
          containerName,
          archiveData,
          archivePassword
        )();

        expect(E.isLeft(result)).toBe(true);
        if (E.isLeft(result)) {
          expect(result.left.kind).toBe("ARCHIVE_GENERATION_FAILURE");
          expect(result.left.reason).toContain("403");
        }
        expect(requests.some(request => getComp(request) === "blocklist")).toBe(
          false
        );
        expect(
          requests
            .filter(request => getComp(request) === "block")
            .every(request =>
              request.headers.authorization?.match(tokenAuthorization)
            )
        ).toBe(true);
      }
    );
  });

  it.each([
    [403, "AuthorizationPermissionMismatch"],
    [400, "InvalidBlockList"]
  ] as const)(
    "fails the archive when committing the block list returns %i",
    async (status, code) => {
      await withBlobTestServer(
        (request, response) =>
          getComp(request) === "blocklist"
            ? sendStorageError(response, status, code)
            : sendUploadSuccess(response),
        async ({ endpoint, requests }) => {
          const result = await saveDataToBlob(
            createBlobServiceClient(endpoint, createTokenCredential()),
            containerName,
            archiveData,
            archivePassword
          )();

          expect(E.isLeft(result)).toBe(true);
          if (E.isLeft(result)) {
            expect(result.left.kind).toBe("ARCHIVE_GENERATION_FAILURE");
          }
          expect(
            requests.some(request => getComp(request) === "blocklist")
          ).toBe(true);
          expect(
            requests
              .filter(request => getComp(request) === "blocklist")
              .every(request =>
                request.headers.authorization?.match(tokenAuthorization)
              )
          ).toBe(true);
        }
      );
    }
  );
});

describe("GDPR archive upload completion", () => {
  it("does not return success before the block list commit completes", async () => {
    let signalCommitReceived: () => void = () => {};
    const commitReceived = new Promise<void>(resolve => {
      signalCommitReceived = resolve;
    });
    let releaseCommit: () => void = () => {};
    const commitGate = new Promise<void>(resolve => {
      releaseCommit = resolve;
    });

    await withBlobTestServer(
      async (request, response) => {
        if (getComp(request) === "blocklist") {
          signalCommitReceived();
          await commitGate;
        }
        sendUploadSuccess(response);
      },
      async ({ endpoint }) => {
        const resultPromise = saveDataToBlob(
          createBlobServiceClient(endpoint, createTokenCredential()),
          containerName,
          archiveData,
          archivePassword
        )();

        await commitReceived;
        const outcome = await Promise.race([
          resultPromise.then(
            () => "completed",
            () => "failed"
          ),
          delay(0).then(() => "pending")
        ]);
        expect(outcome).toBe("pending");

        releaseCommit();
        const result = await resultPromise;
        expect(E.isRight(result)).toBe(true);
      }
    );
  });
});

describe("Blob SDK response compatibility", () => {
  it("preserves successful download and HEAD properties responses", async () => {
    const downloadedContent = Buffer.from("archive-content");

    await withBlobTestServer(
      (request, response) => {
        if (request.method === "HEAD") {
          sendResponse(response, 200, "", {
            "content-length": String(downloadedContent.length),
            "content-type": "application/zip",
            etag: '"0x8DB000000000000"',
            "last-modified": new Date(0).toUTCString(),
            "x-ms-blob-type": "BlockBlob"
          });
          return;
        }

        sendResponse(response, 200, downloadedContent, {
          "content-length": String(downloadedContent.length),
          "content-type": "application/zip",
          etag: '"0x8DB000000000000"',
          "last-modified": new Date(0).toUTCString(),
          "x-ms-blob-type": "BlockBlob"
        });
      },
      async ({ endpoint }) => {
        const blob = createBlobServiceClient(endpoint, createTokenCredential())
          .getContainerClient(containerName)
          .getBlobClient("download.zip");

        const download = await blob.download();
        expect(download.readableStreamBody).toBeDefined();
        if (download.readableStreamBody) {
          await expect(buffer(download.readableStreamBody)).resolves.toEqual(
            downloadedContent
          );
        }

        await expect(blob.getProperties()).resolves.toMatchObject({
          contentLength: downloadedContent.length,
          contentType: "application/zip"
        });
      }
    );
  });

  it("classifies a real BlobNotFound response from the SDK", async () => {
    await withBlobTestServer(
      (_request, response) => sendStorageError(response, 404, "BlobNotFound"),
      async ({ endpoint }) => {
        const blob = createBlobServiceClient(endpoint, createTokenCredential())
          .getContainerClient(containerName)
          .getBlobClient("missing.zip");

        let downloadError: unknown;
        try {
          await blob.download();
        } catch (error) {
          downloadError = error;
        }

        expect(downloadError).toMatchObject({
          code: "BlobNotFound",
          statusCode: 404
        });
        expect(isBlobNotFoundError(downloadError)).toBe(true);
      }
    );
  });

  it("lists blobs through the SDK XML response parser", async () => {
    await withBlobTestServer(
      (_request, response) =>
        sendResponse(
          response,
          200,
          "<EnumerationResults><Blobs/><NextMarker/></EnumerationResults>",
          { "content-type": "application/xml" }
        ),
      async ({ endpoint }) => {
        const container = createBlobServiceClient(
          endpoint,
          createTokenCredential()
        ).getContainerClient(containerName);

        await expect(container.listBlobsFlat().next()).resolves.toMatchObject({
          done: true
        });
      }
    );
  });

  it("supports the explicit StorageCrc64 upload path", async () => {
    await withBlobTestServer(
      (_request, response) => sendUploadSuccess(response),
      async ({ endpoint, requests }) => {
        const blockBlob = createBlobServiceClient(
          endpoint,
          createTokenCredential()
        )
          .getContainerClient(containerName)
          .getBlockBlobClient("crc64.bin");

        await expect(
          blockBlob.uploadData(Buffer.from("checksum-test"), {
            contentChecksumAlgorithm: "StorageCrc64"
          })
        ).resolves.toBeDefined();
        expect(requests).toHaveLength(1);
        expect(requests[0].body.length).toBeGreaterThan(0);
      }
    );
  });

  it("keeps delete failures on the SDK's existing path", async () => {
    await withBlobTestServer(
      (_request, response) =>
        sendStorageError(response, 403, "AuthorizationPermissionMismatch"),
      async ({ endpoint }) => {
        const blob = createBlobServiceClient(endpoint, createTokenCredential())
          .getContainerClient(containerName)
          .getBlobClient("delete.zip");

        await expect(blob.delete()).rejects.toMatchObject({
          code: "AuthorizationPermissionMismatch",
          statusCode: 403
        });
      }
    );
  });

  it("preserves the SDK retry for transient PUT responses", async () => {
    let attempt = 0;
    await withBlobTestServer(
      (_request, response) => {
        attempt += 1;
        if (attempt === 1) {
          sendStorageError(response, 500, "ServerBusy");
          return;
        }
        sendUploadSuccess(response);
      },
      async ({ endpoint, requests }) => {
        const blob = createBlobServiceClientWithPolicy(
          endpoint,
          createTokenCredential(),
          {
            keepAliveOptions: { enable: false },
            retryOptions: {
              maxRetryDelayInMs: 0,
              maxTries: 2,
              retryDelayInMs: 0
            }
          }
        )
          .getContainerClient(containerName)
          .getBlockBlobClient("retry.bin");

        await expect(
          blob.uploadData(Buffer.from("retry-test"))
        ).resolves.toBeDefined();
        expect(requests).toHaveLength(2);
        expect(requests[0].body).toEqual(Buffer.from("retry-test"));
        expect(requests[1].body).toEqual(Buffer.from("retry-test"));
      }
    );
  });
});
