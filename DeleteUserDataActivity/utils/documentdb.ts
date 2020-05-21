import * as DocumentDb from "documentdb";
import { Either, left, right } from "fp-ts/lib/Either";
import { Option } from "fp-ts/lib/Option";
import * as DocumentDbUtilsBase from "io-functions-commons/dist/src/utils/documentdb";

export * from "io-functions-commons/dist/src/utils/documentdb";

export const deleteDocument = (
  client: DocumentDb.DocumentClient,
  collectionUri: DocumentDbUtilsBase.IDocumentDbCollectionUri,
  documentId: string,
  partitionKey?: string
): Promise<Either<DocumentDb.QueryError, string>> => {
  const documentUri = DocumentDbUtilsBase.getDocumentUri(
    collectionUri,
    documentId
  );
  return new Promise(resolve =>
    client.deleteDocument(documentUri.uri, { partitionKey }, err =>
      resolve(err ? left(err) : right(documentId))
    )
  );
};

/**
 *  Find all versions of a document.
 *
 *  Pass the partitionKey field / values if it differs from the modelId
 *  to avoid multi-partition queries.
 */
export function findAllVersionsByModelId<T>(
  client: DocumentDb.DocumentClient,
  collectionUri: DocumentDbUtilsBase.IDocumentDbCollectionUri,
  modelIdField: string,
  modelIdValue: string,
  partitionKeyField: string,
  partitionKeyValue: string
): DocumentDbUtilsBase.IResultIterator<T & DocumentDb.RetrievedDocument> {
  return DocumentDbUtilsBase.queryDocuments(
    client,
    collectionUri,
    {
      parameters: [
        {
          name: "@modelId",
          value: modelIdValue
        },
        {
          name: "@partitionKey",
          value: partitionKeyValue
        }
      ],
      // do not use ${collectionName} here as it may contain special characters
      query: `SELECT * FROM m WHERE (m.${modelIdField} = @modelId
          AND m.${partitionKeyField} = @partitionKey)`
    },
    partitionKeyValue
  );
}

export function deleteAllDocuments<T extends DocumentDb.RetrievedDocument>(
  client: DocumentDb.DocumentClient,
  collectionUri: DocumentDbUtilsBase.IDocumentDbCollectionUri,
  documentIterator: DocumentDbUtilsBase.IResultIterator<T>
): DocumentDbUtilsBase.IFoldableResultIterator<
  Promise<ReadonlyArray<Either<DocumentDb.QueryError, string>>>
> {
  return DocumentDbUtilsBase.reduceResultIterator(
    documentIterator,
    (
      prev: Promise<ReadonlyArray<Either<DocumentDb.QueryError, string>>>,
      curr: T
    ) =>
      Promise.all([prev, deleteDocument(client, collectionUri, curr.id)]).then(
        ([prevResult, currResult]) => [...prevResult, currResult]
      )
  );
}

export function deleteAllDocumentVersions<T>(
  client: DocumentDb.DocumentClient,
  collectionUri: DocumentDbUtilsBase.IDocumentDbCollectionUri,
  modelIdField: string,
  modelIdValue: string,
  partitionKeyField: string,
  partitionKeyValue: string
): Promise<
  Either<
    DocumentDb.QueryError,
    Option<Promise<ReadonlyArray<Either<DocumentDb.QueryError, string>>>>
  >
> {
  // find all docs to delete
  const documentIterator = findAllVersionsByModelId<T>(
    client,
    collectionUri,
    modelIdField,
    modelIdValue,
    partitionKeyField,
    partitionKeyValue
  );

  // then delete
  return deleteAllDocuments(
    client,
    collectionUri,
    documentIterator
  ).executeNext(Promise.resolve([]));
}
