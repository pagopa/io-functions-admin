/* tslint:disable: no-any */
/* tslint:disable: no-big-function */

import * as df from "durable-functions";
import * as lolex from "lolex";

import { left, right } from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";

import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

import { fromEither, fromLeft } from "fp-ts/lib/TaskEither";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  aRetrievedService,
  aSeralizedService,
  aServicePayload
} from "../../__mocks__/mocks";
import { apiServiceToService } from "../../utils/conversions";
import { UpsertServiceEvent } from "../../utils/UpsertServiceEvent";
import { UpdateServiceHandler } from "../handler";

const aDepartmentName = "UpdateDept" as NonEmptyString;
const anUpdatedApiService = apiServiceToService({
  ...aServicePayload,
  department_name: aDepartmentName
});

const leftErrorFn = jest.fn(() => {
  return fromLeft(toCosmosErrorResponse({ kind: "COSMOS_ERROR_RESPONSE" }));
});

// tslint:disable-next-line: no-let
let clock: lolex.InstalledClock;
beforeEach(() => {
  (df.getClient as any).mockClear();
  (df as any).mockStartNew.mockClear();
  clock = lolex.install({ now: Date.now() });
  leftErrorFn.mockClear();
});
afterEach(() => {
  clock.uninstall();
});

describe("UpdateServiceHandler", () => {
  it("should return a validation error and not update the service if the serviceid in the payload is not equal to the serviceid in the path", async () => {
    const aServiceId = "DifferentSubscriptionId" as ServiceId;
    const serviceModelMock = {
      findOneByServiceId: jest.fn(() => {
        return fromEither(right(some(aRetrievedService)));
      }),
      upsert: jest.fn(() =>
        fromEither(
          right(
            some({
              ...aRetrievedService,
              ...anUpdatedApiService
            })
          )
        )
      )
    };

    const updateServiceHandler = UpdateServiceHandler(serviceModelMock as any);

    const response = await updateServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      aServiceId,
      {
        ...aServicePayload,
        department_name: aDepartmentName
      }
    );

    expect(serviceModelMock.findOneByServiceId).not.toHaveBeenCalled();
    expect(serviceModelMock.upsert).not.toHaveBeenCalled();
    expect(response.kind).toBe("IResponseErrorValidation");
  });

  it("should return a query error if an error occurs trying to retrive the service with the requested id", async () => {
    const serviceModelMock = {
      findOneByServiceId: leftErrorFn
    };

    const updateServiceHandler = UpdateServiceHandler(serviceModelMock as any);

    const response = await updateServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      aServicePayload.service_id,
      {
        ...aServicePayload,
        department_name: aDepartmentName
      }
    );

    expect(serviceModelMock.findOneByServiceId).toHaveBeenCalledWith(
      aRetrievedService.serviceId
    );
    expect(response.kind).toBe("IResponseErrorQuery");
  });

  it("should return a not found error if the service with the requested serviceid is not found", async () => {
    const serviceModelMock = {
      findOneByServiceId: jest.fn(() => {
        return fromEither(right(none));
      })
    };

    const updateServiceHandler = UpdateServiceHandler(serviceModelMock as any);

    const response = await updateServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      aServicePayload.service_id,
      {
        ...aServicePayload,
        department_name: aDepartmentName
      }
    );

    expect(serviceModelMock.findOneByServiceId).toHaveBeenCalledWith(
      aRetrievedService.serviceId
    );
    expect(response.kind).toBe("IResponseErrorNotFound");
  });

  it("should return a query error if the exixting service fails to be updated", async () => {
    const serviceModelMock = {
      findOneByServiceId: jest.fn(() => {
        return fromEither(right(some(aRetrievedService)));
      }),
      update: leftErrorFn
    };

    const updateServiceHandler = UpdateServiceHandler(serviceModelMock as any);

    const response = await updateServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      aServicePayload.service_id,
      {
        ...aServicePayload,
        department_name: aDepartmentName
      }
    );

    expect(serviceModelMock.findOneByServiceId).toHaveBeenCalledWith(
      aRetrievedService.serviceId
    );
    expect(serviceModelMock.update).toHaveBeenCalledTimes(1);
    expect(response.kind).toBe("IResponseErrorQuery");
  });

  it("should update an existing service using the payload and return the updated service", async () => {
    const serviceModelMock = {
      findOneByServiceId: jest.fn(() => {
        return fromEither(right(some(aRetrievedService)));
      }),
      update: jest.fn(() =>
        fromEither(
          right({
            ...aRetrievedService,
            ...anUpdatedApiService
          })
        )
      )
    };

    const updateServiceHandler = UpdateServiceHandler(serviceModelMock as any);

    const response = await updateServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      aServicePayload.service_id,
      {
        ...aServicePayload,
        department_name: aDepartmentName
      }
    );

    expect(serviceModelMock.findOneByServiceId).toHaveBeenCalledWith(
      aRetrievedService.serviceId
    );
    expect(serviceModelMock.update).toHaveBeenCalledTimes(1);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual({
        ...aSeralizedService,
        department_name: aDepartmentName
      });
    }
  });

  it("should start the orchestrator with an appropriate event after the service is updated", async () => {
    const serviceModelMock = {
      findOneByServiceId: jest.fn(() => {
        return fromEither(right(some(aRetrievedService)));
      }),
      update: jest.fn(() =>
        fromEither(
          right({
            ...aRetrievedService,
            ...anUpdatedApiService
          })
        )
      )
    };

    const contextMock = {
      log: jest.fn()
    };

    const updateServiceHandler = UpdateServiceHandler(serviceModelMock as any);

    await updateServiceHandler(
      contextMock as any, // Not used
      undefined as any, // Not used
      aServicePayload.service_id,
      {
        ...aServicePayload,
        department_name: aDepartmentName
      }
    );

    const upsertServiceEvent = UpsertServiceEvent.encode({
      newService: { ...aRetrievedService, departmentName: aDepartmentName },
      oldService: aRetrievedService,
      updatedAt: new Date()
    });

    expect(df.getClient).toHaveBeenCalledTimes(1);

    const dfClient = df.getClient(contextMock);
    expect(dfClient.startNew).toHaveBeenCalledTimes(1);
    expect(dfClient.startNew).toHaveBeenCalledWith(
      "UpsertServiceOrchestrator",
      undefined,
      upsertServiceEvent
    );
  });
});
