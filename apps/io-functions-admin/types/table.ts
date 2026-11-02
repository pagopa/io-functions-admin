export type TableEntityWithRowKey<TRowKey extends string> = Readonly<{
  readonly rowKey: TRowKey;
}>;
