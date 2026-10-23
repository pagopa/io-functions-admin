locals {
  project                                 = "${var.prefix}-${var.env_short}"
  rg_common_name                          = format("%s-rg-common", local.project)
  rg_internal_name                        = format("%s-rg-internal", local.project)
  common_resource_group_name_itn          = "${var.project_itn}-common-rg-01"
  itnuserdatadownload_resource_group_name = "${var.project_itn}-platform-admin-rg-01"

  cosmos_db_account_name = "${local.project}-cosmos-api"
  cosmos_db_account_id = format(
    "/subscriptions/%s/resourceGroups/%s/providers/Microsoft.DocumentDB/databaseAccounts/%s",
    data.azurerm_client_config.current.subscription_id,
    local.rg_internal_name,
    local.cosmos_db_account_name
  )
  cosmos_db_name = "db"

  auth_session_storage_account_name = "iopitnauthsessionst01"
  auth_session_storage_account_id = format(
    "/subscriptions/%s/resourceGroups/%s/providers/Microsoft.Storage/storageAccounts/%s",
    data.azurerm_client_config.current.subscription_id,
    "${local.project}-itn-auth-main-rg-01",
    local.auth_session_storage_account_name
  )
  auth_session_storage_table_endpoint = "https://${local.auth_session_storage_account_name}.table.core.windows.net/"
  sanitize_user_profile_queue_name    = "profiles-to-sanitize-01"
}

locals {
  function_admin = {
    app_settings_common = {
      NODE_ENV = "production"

      COSMOSDB_NAME              = "db"
      COSMOSDB_URI               = var.cosmos_db_attributes.endpoint
      COSMOSDB_KEY               = var.cosmos_db_attributes.primary_key
      COSMOSDB_CONNECTION_STRING = format("AccountEndpoint=%s;AccountKey=%s;", var.cosmos_db_attributes.endpoint, var.cosmos_db_attributes.primary_key)

      "COSMOSDB_IDENTITY__accountEndpoint" = var.cosmos_db_attributes.endpoint
      "COSMOSDB_IDENTITY__credential"      = "managedidentity"

      StorageConnection       = data.azurerm_storage_account.storage_api.primary_connection_string
      "STORAGE_BLOB_ENDPOINT" = data.azurerm_storage_account.storage_api.primary_blob_endpoint

      AssetsStorageConnection        = data.azurerm_storage_account.assets_cdn.primary_connection_string
      "ASSETS_STORAGE_BLOB_ENDPOINT" = data.azurerm_storage_account.assets_cdn.primary_blob_endpoint

      "USER_DATA_BACKUP_STORAGE_BLOB_ENDPOINT"  = module.user_data_backups_storage_account.primary_blob_endpoint
      "USER_DATA_ARCHIVE_STORAGE_BLOB_ENDPOINT" = data.azurerm_storage_account.itnuserdatadownload.primary_blob_endpoint
      "API_STORAGE_TABLE_ENDPOINT"              = data.azurerm_storage_account.storage_api.primary_table_endpoint
      "SESSION_STORAGE_TABLE_ENDPOINT"          = local.auth_session_storage_table_endpoint

      "CitizenAuthQueueConnection__queueServiceUri" = data.azurerm_storage_account.auth_maintenance_storage.primary_queue_endpoint
      "CitizenAuthQueueConnection__credential"      = "managedidentity"

      AZURE_APIM                = "io-p-itn-apim-01"
      AZURE_APIM_HOST           = var.apim_hostname_api_internal
      AZURE_APIM_RESOURCE_GROUP = "io-p-itn-common-rg-01"

      MESSAGE_CONTAINER_NAME           = var.message_content_container_name
      UserDataArchiveStorageConnection = module.user_data_download_storage_account.primary_connection_string
      USER_DATA_CONTAINER_NAME         = "user-data-download"

      PUBLIC_API_URL           = var.service_api_url
      PUBLIC_DOWNLOAD_BASE_URL = "https://${data.azurerm_storage_account.itnuserdatadownload.primary_blob_host}/user-data-download"


      UserDataBackupStorageConnection = module.user_data_backups_storage_account.primary_connection_string
      USER_DATA_BACKUP_CONTAINER_NAME = "user-data-backup"
      USER_DATA_DELETE_DELAY_DAYS     = 6
      FF_ENABLE_USER_DATA_DELETE      = 1

      MAIL_FROM = "IO - l'app dei servizi pubblici <no-reply@io.italia.it>"

      SUBSCRIPTIONS_FEED_TABLE          = "SubscriptionsFeedByDay"
      SubscriptionFeedStorageConnection = data.azurerm_storage_account.storage_api.primary_connection_string

      // table for saving failed user data processing requests
      FAILED_USER_DATA_PROCESSING_TABLE         = "FailedUserDataProcessing"
      FailedUserDataProcessingStorageConnection = data.azurerm_storage_account.storage_api.primary_connection_string

      # SECRETS
      LOGOS_URL = "@Microsoft.KeyVault(VaultName=${data.azurerm_key_vault.common.name};SecretName=cdn-ASSETS-URL)"

      AZURE_SUBSCRIPTION_ID = "@Microsoft.KeyVault(VaultName=${data.azurerm_key_vault.common.name};SecretName=common-AZURE-SUBSCRIPTION-ID)"

      SERVICE_PRINCIPAL_CLIENT_ID = "@Microsoft.KeyVault(VaultName=${data.azurerm_key_vault.common.name};SecretName=ad-APPCLIENT-APIM-ID)"
      SERVICE_PRINCIPAL_SECRET    = "@Microsoft.KeyVault(VaultName=${data.azurerm_key_vault.common.name};SecretName=ad-APPCLIENT-APIM-SECRET)"
      SERVICE_PRINCIPAL_TENANT_ID = "@Microsoft.KeyVault(VaultName=${data.azurerm_key_vault.common.name};SecretName=common-AZURE-TENANT-ID)"

      PUBLIC_API_KEY = "@Microsoft.KeyVault(VaultName=${data.azurerm_key_vault.common.name};SecretName=apim-IO-GDPR-SERVICE-KEY)"

      SESSION_MANAGER_INTERNAL_API_URL = "https://${data.azurerm_linux_function_app.session_manager_internal.default_hostname}"
      SESSION_MANAGER_INTERNAL_API_KEY = "@Microsoft.KeyVault(VaultName=${data.azurerm_key_vault.common.name};SecretName=fn-admin-session-manager-internal-key)"

      __DISABLED__SENDGRID_API_KEY = "@Microsoft.KeyVault(VaultName=${data.azurerm_key_vault.common.name};SecretName=common-SENDGRID-APIKEY)"
      MAILUP_USERNAME              = "@Microsoft.KeyVault(VaultName=${data.azurerm_key_vault.common.name};SecretName=common-MAILUP-AI-USERNAME)"
      MAILUP_SECRET                = "@Microsoft.KeyVault(VaultName=${data.azurerm_key_vault.common.name};SecretName=common-MAILUP-AI-SECRET)"

      # UNIQUE EMAIL ENFORCEMENT
      CitizenAuthStorageConnection = data.azurerm_storage_account.auth_maintenance_storage.primary_connection_string
      SanitizeUserProfileQueueName = local.sanitize_user_profile_queue_name

      # Locked Profile Storage
      LOCKED_PROFILES_STORAGE_CONNECTION_STRING = data.azurerm_key_vault_secret.common_SESSION_ST_CONNECTION_STRING.value
      LOCKED_PROFILES_TABLE_NAME                = var.function_admin_locked_profiles_table_name

      PROFILE_EMAILS_STORAGE_CONNECTION_STRING = data.azurerm_key_vault_secret.common_SESSION_ST_CONNECTION_STRING.value
      PROFILE_EMAILS_TABLE_NAME                = "profileemails01"

      # Instant delete
      INSTANT_DELETE_ENABLED_USERS = join(",", [data.azurerm_key_vault_secret.fn_admin_INSTANT_DELETE_ENABLED_USERS.value, module.tests.users.light])

    }
  }
}
