/* eslint-disable sort-keys */
import { UTCISODateFromString } from "@pagopa/ts-commons/lib/dates";
import { EncryptedPayload } from "@pagopa/ts-commons/lib/encrypt";
import { IPString } from "@pagopa/ts-commons/lib/strings";
import * as t from "io-ts";
import * as xPath from "xpath";

const SAML_RESPONSE_TAG = "samlp:Response";
const SAML_ASSERTION_TAG = "saml:Assertion";
const SIGNATURE_INFO_TAG = "ds:Signature";
const DATE_THRESHOLD = "2025-03-19";
const STRICT_DATE_REGEX = /-(\d{4}-\d{2}-\d{2})-/;

export const SpidBlobItem = t.interface({
  // Timestamp of Request/Response creation
  createdAt: UTCISODateFromString,

  // IP of the client that made a SPID login action
  ip: IPString,

  // XML payload of the SPID Request
  // eslint-disable-next-line sort-keys
  encryptedRequestPayload: EncryptedPayload,

  // XML payload of the SPID Response
  encryptedResponsePayload: EncryptedPayload,

  // SPID request ID
  spidRequestId: t.string
});

export type SpidBlobItem = t.TypeOf<typeof SpidBlobItem>;

export const isBlobAboveThreshold = (blobName: string): boolean => {
  const regex = new RegExp(STRICT_DATE_REGEX);
  const result = regex.exec(blobName);

  if (result) {
    const date = result[1];
    return DATE_THRESHOLD < date;
  }

  return false;
};

export const hasCommentsOnAnyDigestValue = (dom: Document): boolean => {
  const digestValues = xPath.select(
    "//*[local-name()='DigestValue'][count(node()) > 1]",
    dom
  );

  // true if any of the searched elements has at least one comment
  return digestValues.length > 0;
};

export const hasMoreSignedInfoNodes = (dom: Document): boolean => {
  const customSelect = xPath.useNamespaces({
    samlp: "urn:oasis:names:tc:SAML:2.0:protocol",
    saml: "urn:oasis:names:tc:SAML:2.0:assertion",
    ds: "http://www.w3.org/2000/09/xmldsig#"
  });
  const signedInfoPath = "//*[local-name(.)='SignedInfo']";
  const SAMLResponseSignedInfoNodes = customSelect(
    `/${SAML_RESPONSE_TAG}/${SIGNATURE_INFO_TAG}${signedInfoPath}`,
    dom
  );
  const SAMLAssertionSignedInfoNodes = customSelect(
    `/${SAML_RESPONSE_TAG}/${SAML_ASSERTION_TAG}/${SIGNATURE_INFO_TAG}${signedInfoPath}`,
    dom
  );

  return (
    SAMLAssertionSignedInfoNodes.length > 1 ||
    // SAML response signature is not mandatory
    SAMLResponseSignedInfoNodes.length > 1
  );
};
