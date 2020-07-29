import { Container } from "@azure/cosmos";
import * as DocumentDb from "documentdb";
import { Either, left, right } from "fp-ts/lib/Either";
import { Option } from "fp-ts/lib/Option";
import { TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
import { mapAsyncIterable } from "io-functions-commons/dist/src/utils/async";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "io-functions-commons/dist/src/utils/cosmosdb_model";
import * as DocumentDbUtilsBase from "io-functions-commons/dist/src/utils/documentdb";
import * as t from "io-ts";

export * from "io-functions-commons/dist/src/utils/documentdb";

export const deleteDocument = (
  container: Container,
  documentId: string,
  partitionKey?: string
): TaskEither<CosmosErrors, string> => {
  return tryCatch(
    () => container.item(documentId, partitionKey).delete(),
    toCosmosErrorResponse
  ).map(_ => _.item.id);
};

/**
 *  Find all versions of a document.
 *
 *  Pass the partitionKey field / values if it differs from the modelId
 *  to avoid multi-partition queries.
 */
export function findAllVersionsByModelId<TR>(
  container: Container,
  retrievedItemType: t.Type<TR, unknown, unknown>,
  modelIdField: string,
  modelIdValue: string,
  partitionKeyField: string,
  partitionKeyValue: string
): AsyncIterable<ReadonlyArray<t.Validation<TR>>> {
  const iterator = container.items
    .query({
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
    })
    .getAsyncIterator();
  return mapAsyncIterable(iterator, feedResponse =>
    feedResponse.resources.map(retrievedItemType.decode)
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
