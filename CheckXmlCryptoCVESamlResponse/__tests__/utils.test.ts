import {
  hasCommentsOnAnyDigestValue,
  hasMoreSignedInfoNodes,
  isBlobAboveThreshold
} from "../utils";
import { DOMParser } from "@xmldom/xmldom";

const aMalformedSAMLResponse = `<samlp:Response Destination="https://that.spid.example.org/saml2/acs/post" ID="_5e728601-9ad4-4686-b269-81d107a8194a" InResponseTo="id-wr6bt7ZpfqiYVrqTd" IssueInstant="2021-02-04T15:41:59Z" Version="2.0" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
    <saml:Issuer Format="urn:oasis:names:tc:SAML:2.0:nameid-format:entity">
        http://localhost:8080
    </saml:Issuer>
    <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
          <ds:SomeNode>
            <ds:SignedInfo>
              <ds:Reference URI="somefakereference">
                <ds:DigestValue>forgeddigestvalue</ds:DigestValue>
              </ds:Reference>
            </ds:SignedInfo>
          </ds:SomeNode>
          <ds:SignedInfo>
            <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
            <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
            <ds:Reference URI="#_5e728601-9ad4-4686-b269-81d107a8194a">
                <ds:Transforms>
                    <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
                    <ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
                </ds:Transforms>
                <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                <ds:DigestValue><!--MALFORMED-->6V8qWljmWULO0C0OQit0DaylE+neFN9K8SXR2izWXpw=</ds:DigestValue>
            </ds:Reference>
        </ds:SignedInfo>
        <ds:SignatureValue>
            ...
        </ds:SignatureValue>
        <ds:KeyInfo>
            <ds:X509Data>
                <ds:X509Certificate>
                    ...
                </ds:X509Certificate>
            </ds:X509Data>
        </ds:KeyInfo>
    </ds:Signature>
       
    <samlp:Status>
        <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
    </samlp:Status>
    
    <saml:Assertion ID="_bebbed6a-2f6c-43d9-b151-f214d0c61de0" IssueInstant="2021-02-04T15:41:59Z" Version="2.0" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        
        <saml:Issuer Format="urn:oasis:names:tc:SAML:2.0:nameid-format:entity">
            https://that.spid.idp.example.org/metadata
        </saml:Issuer>
        <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
            <ds:SignedInfo>
                <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
                <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
                <ds:Reference URI="#_bebbed6a-2f6c-43d9-b151-f214d0c61de0">
                    <ds:Transforms>
                        <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
                        <ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
                    </ds:Transforms>
                    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                    <ds:DigestValue>
            <!--MALFORMED+neFN9K8SXR2izWXpw=-->


            6V8qWljmWULO0C0OQit0DaylE+neFN9K8SXR2izWXpw=
                    </ds:DigestValue>
                </ds:Reference>
            </ds:SignedInfo>
            <ds:SignatureValue>
                ...
            </ds:SignatureValue>
            <ds:KeyInfo>
                <ds:X509Data>
                    <ds:X509Certificate>
                        ...
                    </ds:X509Certificate>
                </ds:X509Data>
            </ds:KeyInfo>
        </ds:Signature>
        
        <saml:Subject>
            <saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:transient" NameQualifier="https://validator.spid.gov.it">
                    _655df4bc-b372-475e-906d-e71e4d7e98de
            </saml:NameID>
            <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
                <saml:SubjectConfirmationData InResponseTo="id-wr6bt7ZpfqiYVrqTd" NotOnOrAfter="2021-02-04T15:46:51Z" Recipient="https://that.spid.example.org/saml2/acs/post"/>
            </saml:SubjectConfirmation>
        </saml:Subject>
        
        <saml:Conditions NotBefore="2021-02-04T15:41:59Z" NotOnOrAfter="2021-02-04T15:46:51Z">
            <saml:AudienceRestriction>
                <saml:Audience>
                    http://that.spid.example.org/saml2/metadata
                </saml:Audience>
            </saml:AudienceRestriction>
        </saml:Conditions>
         
        <saml:AuthnStatement AuthnInstant="2021-02-04T15:41:59Z" SessionIndex="_ec9c5b35-12dc-414d-ad09-5b4610934db8">
            <saml:AuthnContext>
                <saml:AuthnContextClassRef>
                    https://www.spid.gov.it/SpidL1
                </saml:AuthnContextClassRef>
            </saml:AuthnContext>
        </saml:AuthnStatement>
        
        <saml:AttributeStatement>

            <saml:Attribute Name="spidCode" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">                       
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    AGID-001
                </saml:AttributeValue>
            </saml:Attribute>                                          
            <saml:Attribute Name="name" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    SpidValidator
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="familyName" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    AgID
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="placeOfBirth" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    Roma
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="countyOfBirth" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    RM
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="dateOfBirth" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:date">
                    2000-01-01
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="gender" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    M
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="companyName" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    Agenzia per l'Italia Digitale
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="registeredOffice" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    Via Listz 21 00144 Roma
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="fiscalNumber" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    TINIT-GDASDV00A01H501J
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="ivaCode" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    VATIT-97735020584
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="idCard" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    CartaIdentità AA00000000 ComuneRoma 2018-01-01 2028-01-01
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="expirationDate" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:date">
                    2028-01-01
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="mobilePhone" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    +393331234567
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="email" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    spid.tech@agid.gov.it
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="address" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    Via Listz 21 00144 Roma
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="digitalAddress" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    pec@pecagid.gov.it
                </saml:AttributeValue>
            </saml:Attribute>
        </saml:AttributeStatement>
    </saml:Assertion>

</samlp:Response>`;

const parsedMalformedSAMLResponse = new DOMParser().parseFromString(
  aMalformedSAMLResponse,
  "text/xml"
);

const anOKSAMLResponse = `<samlp:Response Destination="https://that.spid.example.org/saml2/acs/post" ID="_5e728601-9ad4-4686-b269-81d107a8194a" InResponseTo="id-wr6bt7ZpfqiYVrqTd" IssueInstant="2021-02-04T15:41:59Z" Version="2.0" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
    <saml:Issuer Format="urn:oasis:names:tc:SAML:2.0:nameid-format:entity">
        http://localhost:8080
    </saml:Issuer>
    <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
          <ds:SignedInfo>
            <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
            <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
            <ds:Reference URI="#_5e728601-9ad4-4686-b269-81d107a8194a">
                <ds:Transforms>
                    <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
                    <ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
                </ds:Transforms>
                <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                <ds:DigestValue>6V8qWljmWULO0C0OQit0DaylE+neFN9K8SXR2izWXpw=</ds:DigestValue>
            </ds:Reference>
        </ds:SignedInfo>
        <ds:SignatureValue>
            ...
        </ds:SignatureValue>
        <ds:KeyInfo>
            <ds:X509Data>
                <ds:X509Certificate>
                    ...
                </ds:X509Certificate>
            </ds:X509Data>
        </ds:KeyInfo>
    </ds:Signature>
       
    <samlp:Status>
        <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
    </samlp:Status>
    
    <saml:Assertion ID="_bebbed6a-2f6c-43d9-b151-f214d0c61de0" IssueInstant="2021-02-04T15:41:59Z" Version="2.0" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        
        <saml:Issuer Format="urn:oasis:names:tc:SAML:2.0:nameid-format:entity">
            https://that.spid.idp.example.org/metadata
        </saml:Issuer>
        <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
            <ds:SignedInfo>
                <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
                <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
                <ds:Reference URI="#_bebbed6a-2f6c-43d9-b151-f214d0c61de0">
                    <ds:Transforms>
                        <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
                        <ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
                    </ds:Transforms>
                    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                    <ds:DigestValue>
            6V8qWljmWULO0C0OQit0DaylE+neFN9K8SXR2izWXpw=
                    </ds:DigestValue>
                </ds:Reference>
            </ds:SignedInfo>
            <ds:SignatureValue>
                ...
            </ds:SignatureValue>
            <ds:KeyInfo>
                <ds:X509Data>
                    <ds:X509Certificate>
                        ...
                    </ds:X509Certificate>
                </ds:X509Data>
            </ds:KeyInfo>
        </ds:Signature>
        
        <saml:Subject>
            <saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:transient" NameQualifier="https://validator.spid.gov.it">
                    _655df4bc-b372-475e-906d-e71e4d7e98de
            </saml:NameID>
            <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
                <saml:SubjectConfirmationData InResponseTo="id-wr6bt7ZpfqiYVrqTd" NotOnOrAfter="2021-02-04T15:46:51Z" Recipient="https://that.spid.example.org/saml2/acs/post"/>
            </saml:SubjectConfirmation>
        </saml:Subject>
        
        <saml:Conditions NotBefore="2021-02-04T15:41:59Z" NotOnOrAfter="2021-02-04T15:46:51Z">
            <saml:AudienceRestriction>
                <saml:Audience>
                    http://that.spid.example.org/saml2/metadata
                </saml:Audience>
            </saml:AudienceRestriction>
        </saml:Conditions>
         
        <saml:AuthnStatement AuthnInstant="2021-02-04T15:41:59Z" SessionIndex="_ec9c5b35-12dc-414d-ad09-5b4610934db8">
            <saml:AuthnContext>
                <saml:AuthnContextClassRef>
                    https://www.spid.gov.it/SpidL1
                </saml:AuthnContextClassRef>
            </saml:AuthnContext>
        </saml:AuthnStatement>
        
        <saml:AttributeStatement>

            <saml:Attribute Name="spidCode" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">                       
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    AGID-001
                </saml:AttributeValue>
            </saml:Attribute>                                          
            <saml:Attribute Name="name" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    SpidValidator
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="familyName" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    AgID
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="placeOfBirth" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    Roma
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="countyOfBirth" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    RM
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="dateOfBirth" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:date">
                    2000-01-01
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="gender" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    M
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="companyName" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    Agenzia per l'Italia Digitale
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="registeredOffice" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    Via Listz 21 00144 Roma
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="fiscalNumber" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    TINIT-GDASDV00A01H501J
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="ivaCode" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    VATIT-97735020584
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="idCard" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    CartaIdentità AA00000000 ComuneRoma 2018-01-01 2028-01-01
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="expirationDate" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:date">
                    2028-01-01
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="mobilePhone" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    +393331234567
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="email" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    spid.tech@agid.gov.it
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="address" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    Via Listz 21 00144 Roma
                </saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="digitalAddress" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
                    pec@pecagid.gov.it
                </saml:AttributeValue>
            </saml:Attribute>
        </saml:AttributeStatement>
    </saml:Assertion>

</samlp:Response>`;

const parsedOKSAMLResponse = new DOMParser().parseFromString(
  anOKSAMLResponse,
  "text/xml"
);

describe("CheckXmlCryptoCVESamlResponse", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("isBlobAboveThreshold", () => {
    it("should return true when date is above threshold", async () => {
      const aboveThresholdBlobName =
        "SPNDNL80R13C555X-2025-03-21-sha256-test.json";

      const result = isBlobAboveThreshold(aboveThresholdBlobName);

      expect(result).toBeTruthy();
    });

    it("should return false when date is before threshold", async () => {
      const aboveThresholdBlobName =
        "SPNDNL80R13C555X-2025-03-19-sha256-test.json";

      const result = isBlobAboveThreshold(aboveThresholdBlobName);

      expect(result).toBeFalsy();
    });
  });

  describe("hasCommentsOnAnyDigestValue", () => {
    it("should return true when at least one comment is found on Digest", async () => {
      const result = hasCommentsOnAnyDigestValue(parsedMalformedSAMLResponse);

      expect(result).toBeTruthy();
    });

    it("should return false when date is before threshold", async () => {
      const result = hasCommentsOnAnyDigestValue(parsedOKSAMLResponse);

      expect(result).toBeFalsy();
    });
  });

  describe("hasMoreSignedInfoNodes", () => {
    it("should return true when more than one signed node is is found", async () => {
      const result = hasMoreSignedInfoNodes(parsedMalformedSAMLResponse);

      expect(result).toBeTruthy();
    });

    it("should return false when date only one signed node is is found", async () => {
      const result = hasCommentsOnAnyDigestValue(parsedOKSAMLResponse);

      expect(result).toBeFalsy();
    });
  });
});
