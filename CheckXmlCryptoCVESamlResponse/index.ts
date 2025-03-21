/* eslint-disable sort-keys */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Context } from "@azure/functions";
import { toPlainText } from "@pagopa/ts-commons/lib/encrypt";
import { DOMParser } from "@xmldom/xmldom";
import * as E from "fp-ts/lib/Either";

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { trackEvent } from "../utils/appinsights";
import { getConfigOrThrow } from "../utils/config";
import {
  hasCommentsOnAnyDigestValue,
  hasMoreSignedInfoNodes,
  isBlobAboveThreshold,
  PlainTextSpidBlobItem,
  SpidBlobItem
} from "./utils";

const config = getConfigOrThrow();

const getResponsePayloadOrThrow = (
  spidBlobItemVal: SpidBlobItem,
  pk: NonEmptyString,
  context: Context
) => {
  // eslint-disable-next-line functional/no-let
  let responsePayload: string;

  if (PlainTextSpidBlobItem.is(spidBlobItemVal)) {
    responsePayload = spidBlobItemVal.SAMLResponse;
  } else {
    const decryptedResponsePayloadRes = toPlainText(
      config.LOG_RSA_PK,
      spidBlobItemVal.encryptedResponsePayload
    );

    if (E.isLeft(decryptedResponsePayloadRes)) {
      context.log.error(
        "Error decrypting SPID response payload",
        decryptedResponsePayloadRes.left
      );
      throw new Error("Error decrypting SPID response payload");
    }

    responsePayload = decryptedResponsePayloadRes.right;
  }
  return responsePayload;
};

const CheckXmlCryptoCVESamlResponse = async (context: Context) => {
  const blobName = context.bindingData.blobTrigger;

  if (isBlobAboveThreshold(blobName)) {
    trackEvent({
      name: `CheckXmlCryptoCVESamlResponse.thresholdReached`
    });
    return;
  }

  const blobBuffer = context.bindings.InputBlob;
  const blobString = blobBuffer.toString();
  const blobObj = JSON.parse(blobString);

  const spidBlobItemRes = SpidBlobItem.decode(blobObj);

  if (E.isLeft(spidBlobItemRes)) {
    context.log.error("Error decoding SPID blob item", spidBlobItemRes.left);
    throw new Error("Error decoding SPID blob item");
  }

  const spidBlobItemVal = spidBlobItemRes.right;

  const responsePayload: string = getResponsePayloadOrThrow(
    spidBlobItemVal,
    config.LOG_RSA_PK,
    context
  );

  const decryptedResponsePayloadParsedXML = new DOMParser().parseFromString(
    responsePayload,
    "text/xml"
  );

  const hasCommentsOnAnyDigestValueRes = hasCommentsOnAnyDigestValue(
    decryptedResponsePayloadParsedXML
  );

  const hasMoreSingnedNodesRes = hasMoreSignedInfoNodes(
    decryptedResponsePayloadParsedXML
  );

  if (hasCommentsOnAnyDigestValueRes || hasMoreSingnedNodesRes) {
    trackEvent({
      // eslint-disable-next-line sonarjs/no-duplicate-string
      name: `spid.error.validation`,
      properties: {
        hasCommentsOnAnyDigestValue: hasCommentsOnAnyDigestValueRes,
        hasMoreSingnedNodes: hasMoreSingnedNodesRes,
        blobName
      },
      tagOverrides: { samplingEnabled: "false" }
    });
  }
};

export default CheckXmlCryptoCVESamlResponse;
