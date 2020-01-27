/* tslint:disable: no-any */
/* tslint:disable: no-big-function */

import * as df from "durable-functions";

import { left, right } from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";

import { NonEmptyString } from "italia-ts-commons/lib/strings";

import {
  aRetrievedService,
  aSeralizedService,
  aServicePayload
} from "../../__mocks__/mocks";
import { ServiceId } from "../../generated/definitions/ServiceId";
import { UpsertServiceEvent } from "../../utils/UpsertServiceEvent";
import { UpdateServiceHandler } from "../handler";

beforeEach(() => {
  (df.getClient as any).mockClear();
  (df as any).mockStartNew.mockClear();
});

describe("UpdateServiceHandler", () => {
  it("should return a validation error and not update the service if the serviceid in the payload is not equal to the serviceid in the path", async () => {
    const aServiceId = "DifferentSubscriptionId" as ServiceId;
    const aDepartmentName = "UpdateDept" as NonEmptyString;
    const serviceModelMock = {
      findOneByServiceId: jest.fn(() => {
        return Promise.resolve(right(some(aRetrievedService)));
      }),
      update: jest.fn((_, __, f) => {
        const updatedService = f(aRetrievedService);
        return Promise.resolve(right(some(updatedService)));
      })
    };

    const updateServiceHandler = UpdateServiceHandler(
      undefined as any, // Not used
      serviceModelMock as any
    );

    const response = await updateServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      undefined as any, // Not used
      undefined as any, // Not used
      aServiceId,
      {
        ...aServicePayload,
        department_name: aDepartmentName
      }
    );

    expect(serviceModelMock.findOneByServiceId).not.toHaveBeenCalled();
    expect(serviceModelMock.update).not.toHaveBeenCalled();
    expect(response.kind).toBe("IResponseErrorValidation");
  });

  it("should return a query error if an error occurs trying to retrive the service with the requested id", async () => {
    const aDepartmentName = "UpdateDept" as NonEmptyString;
    const serviceModelMock = {
      findOneByServiceId: jest.fn(() => {
        return Promise.resolve(left({}));
      })
    };

    const updateServiceHandler = UpdateServiceHandler(
      undefined as any, // Not used
      serviceModelMock as any
    );

    const response = await updateServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
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
    const aDepartmentName = "UpdateDept" as NonEmptyString;
    const serviceModelMock = {
      findOneByServiceId: jest.fn(() => {
        return Promise.resolve(right(none));
      })
    };

    const updateServiceHandler = UpdateServiceHandler(
      undefined as any, // Not used
      serviceModelMock as any
    );

    const response = await updateServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
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
    const aDepartmentName = "UpdateDept" as NonEmptyString;
    const serviceModelMock = {
      findOneByServiceId: jest.fn(() => {
        return Promise.resolve(right(some(aRetrievedService)));
      }),
      update: jest.fn((_, __, ___) => {
        return Promise.resolve(left({}));
      })
    };

    const updateServiceHandler = UpdateServiceHandler(
      undefined as any, // Not used
      serviceModelMock as any
    );

    const response = await updateServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
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

  it("should return a internal error if the updated service is empty", async () => {
    const aDepartmentName = "UpdateDept" as NonEmptyString;
    const serviceModelMock = {
      findOneByServiceId: jest.fn(() => {
        return Promise.resolve(right(some(aRetrievedService)));
      }),
      update: jest.fn((_, __, ___) => {
        return Promise.resolve(right(none));
      })
    };

    const updateServiceHandler = UpdateServiceHandler(
      undefined as any, // Not used
      serviceModelMock as any
    );

    const response = await updateServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
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
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should update an existing service using the payload and return the updated service", async () => {
    const aDepartmentName = "UpdateDept" as NonEmptyString;
    const serviceModelMock = {
      findOneByServiceId: jest.fn(() => {
        return Promise.resolve(right(some(aRetrievedService)));
      }),
      update: jest.fn((_, __, f) => {
        const updatedService = f(aRetrievedService);
        return Promise.resolve(right(some(updatedService)));
      })
    };

    const updateServiceHandler = UpdateServiceHandler(
      undefined as any, // Not used
      serviceModelMock as any
    );

    const response = await updateServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
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
    const aDepartmentName = "UpdateDept" as NonEmptyString;
    const serviceModelMock = {
      findOneByServiceId: jest.fn(() => {
        return Promise.resolve(right(some(aRetrievedService)));
      }),
      update: jest.fn((_, __, f) => {
        const updatedService = f(aRetrievedService);
        return Promise.resolve(right(some(updatedService)));
      })
    };

    const contextMock = {
      log: jest.fn()
    };

    const updateServiceHandler = UpdateServiceHandler(
      undefined as any,
      serviceModelMock as any
    );

    await updateServiceHandler(
      contextMock as any, // Not used
      undefined as any, // Not used
      undefined as any, // Not used
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
