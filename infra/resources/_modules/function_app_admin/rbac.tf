locals {
  function_admin_slot_principal_ids = {
    production = module.function_admin_itn.function_app.function_app.principal_id
    staging    = module.function_admin_itn.function_app.function_app.slot.principal_id
  }

  function_admin_blob_container_scopes = {
    message_content = format(
      "%s/blobServices/default/containers/%s",
      data.azurerm_storage_account.storage_api.id,
      var.message_content_container_name
    )
    assets = format(
      "%s/blobServices/default/containers/services",
      data.azurerm_storage_account.assets_cdn.id
    )
    user_data_backup = format(
      "%s/blobServices/default/containers/user-data-backup",
      module.user_data_backups_storage_account.id
    )
    user_data_download = format(
      "%s/blobServices/default/containers/user-data-download",
      module.user_data_download_storage_account.id
    )
  }

  function_admin_table_scopes = {
    subscriptions_feed = format(
      "%s/tableServices/default/tables/SubscriptionsFeedByDay",
      data.azurerm_storage_account.storage_api.id
    )
    failed_user_data_processing = format(
      "%s/tableServices/default/tables/FailedUserDataProcessing",
      data.azurerm_storage_account.storage_api.id
    )
    locked_profiles = format(
      "%s/tableServices/default/tables/%s",
      local.auth_session_storage_account_id,
      var.function_admin_locked_profiles_table_name
    )
    profile_emails = format(
      "%s/tableServices/default/tables/profileemails01",
      local.auth_session_storage_account_id
    )
  }

  function_admin_blob_role_assignments = {
    for assignment in flatten([
      for slot, principal_id in local.function_admin_slot_principal_ids : [
        for resource, scope in local.function_admin_blob_container_scopes : {
          key          = "${slot}/${resource}"
          principal_id = principal_id
          scope        = scope
        }
      ]
    ]) : assignment.key => assignment
  }

  function_admin_table_role_assignments = {
    for assignment in flatten([
      for slot, principal_id in local.function_admin_slot_principal_ids : [
        for resource, scope in local.function_admin_table_scopes : {
          key          = "${slot}/${resource}"
          principal_id = principal_id
          scope        = scope
        }
      ]
    ]) : assignment.key => assignment
  }

  function_admin_queue_role_assignments = {
    for slot, principal_id in local.function_admin_slot_principal_ids : "${slot}/citizen-auth-queues" => {
      principal_id         = principal_id
      scope                = data.azurerm_storage_account.auth_maintenance_storage.id
      role_definition_name = "Storage Queue Data Contributor"
    }
  }
}

resource "azurerm_role_assignment" "blob_data_contributor" {
  for_each = local.function_admin_blob_role_assignments

  name = uuidv5(
    "url",
    "https://github.com/pagopa/io-functions-admin/${each.key}/${each.value.scope}/StorageBlobDataContributor"
  )
  scope                = each.value.scope
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = each.value.principal_id
}

resource "azurerm_role_assignment" "table_data_contributor" {
  for_each = local.function_admin_table_role_assignments

  name = uuidv5(
    "url",
    "https://github.com/pagopa/io-functions-admin/${each.key}/${each.value.scope}/StorageTableDataContributor"
  )
  scope                = each.value.scope
  role_definition_name = "Storage Table Data Contributor"
  principal_id         = each.value.principal_id
}

resource "azurerm_role_assignment" "queue_access" {
  for_each = local.function_admin_queue_role_assignments

  name = uuidv5(
    "url",
    "https://github.com/pagopa/io-functions-admin/${each.key}/${each.value.scope}/QueueAccess"
  )
  scope                = each.value.scope
  role_definition_name = each.value.role_definition_name
  principal_id         = each.value.principal_id
}

resource "azurerm_cosmosdb_sql_role_assignment" "function_admin" {
  for_each = local.function_admin_slot_principal_ids

  name = uuidv5(
    "url",
    "https://github.com/pagopa/io-functions-admin/${each.key}/${local.cosmos_db_account_id}/CosmosDbBuiltInDataContributor"
  )
  resource_group_name = local.rg_internal_name
  account_name        = local.cosmos_db_account_name
  role_definition_id  = "${local.cosmos_db_account_id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
  principal_id        = each.value
  scope               = "${local.cosmos_db_account_id}/dbs/${local.cosmos_db_name}"
}