/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable sonar/sonar-max-lines-per-function */
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import * as TE from "fp-ts/lib/TaskEither";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  aNewService,
  aRetrievedService,
  aSeralizedService,
  aServicePayload
} from "../../__mocks__/mocks";
import { CreateServiceHandler } from "../handler";

describe("CreateServiceHandler", () => {
  it("should return a query error if the service fails to be created", async () => {
    const mockServiceModel = {
      create: vi.fn(_ =>
        TE.left(toCosmosErrorResponse({ kind: "COSMOS_ERROR_RESPONSE" }))
      )
    };

    const createServiceHandler = CreateServiceHandler(mockServiceModel as any);

    const response = await createServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      aServicePayload
    );

    expect(mockServiceModel.create).toHaveBeenCalledWith(aNewService);
    expect(response.kind).toBe("IResponseErrorQuery");
  });

  it("should create a new service using the payload and return the created service", async () => {
    const mockServiceModel = {
      create: vi.fn(_ => TE.right(aRetrievedService))
    };

    const createServiceHandler = CreateServiceHandler(mockServiceModel as any);

    const response = await createServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      aServicePayload
    );

    expect(mockServiceModel.create).toHaveBeenCalledWith(aNewService);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual(aSeralizedService);
    }
  });
});
