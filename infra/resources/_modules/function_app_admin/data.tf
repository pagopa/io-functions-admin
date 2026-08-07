
data "azurerm_client_config" "current" {}

data "azurerm_resource_group" "weu_common" {
  name = "${var.prefix}-${var.env_short}-rg-common"
}

data "azurerm_subnet" "private_endpoints_subnet_itn" {
  name                 = "io-p-itn-pep-snet-01"
  virtual_network_name = var.vnet_common_name_itn
  resource_group_name  = var.common_resource_group_name_itn
}

#
# Secrets
#

data "azurerm_key_vault" "itn_key_vault" {
  name                = "${var.project_itn}-platform-kv-01"
  resource_group_name = var.common_resource_group_name_itn
}

data "azurerm_key_vault" "common" {
  name                = format("%s-kv-common", local.project)
  resource_group_name = local.rg_common_name
}

data "azurerm_key_vault_secret" "fn_admin_INSTANT_DELETE_ENABLED_USERS" {
  name         = "fn-admin-INSTANT-DELETE-ENABLED-USERS"
  key_vault_id = data.azurerm_key_vault.common.id
}

#
# Storage
#

#
# TODO: after february 2029, the old iopstuserdatadownload storage account in westeurope will be eligible for deletion.
#

data "azurerm_storage_account" "itnuserdatadownload" {
  name                = module.user_data_download_storage_account.name
  resource_group_name = local.itnuserdatadownload_resource_group_name
}

data "azurerm_storage_account" "storage_api" {
  name                = replace("${local.project}stapi", "-", "")
  resource_group_name = local.rg_internal_name
}

data "azurerm_storage_account" "assets_cdn" {
  name                = replace("${local.project}-stcdnassets", "-", "")
  resource_group_name = local.rg_common_name
}

data "azurerm_storage_account" "logs02" {
  name                = replace("${local.project}-stlogs02", "-", "")
  resource_group_name = "${local.project}-rg-operations"
}

data "azurerm_storage_account" "ioweb_spid_logs_storage" {
  name                = "iopweuiowebspidlogsimst"
  resource_group_name = "io-p-weu-ioweb-storage-rg"
}

#
# UNIQUE EMAIL ENFORCEMENT
#
# TODO: Remove when switch to new itn storage account is done

data "azurerm_storage_account" "auth_maintenance_storage" {
  name                = replace(format("%s-itn-auth-mnt-st-01", local.project), "-", "")
  resource_group_name = format("%s-itn-auth-main-rg-01", local.project)
}

data "azurerm_linux_function_app" "session_manager_internal" {
  name                = format("%s-weu-auth-sm-int-func-01", local.project)
  resource_group_name = format("%s-auth-main-rg-01", var.project_itn)
}

data "azurerm_monitor_action_group" "io_auth_error_action_group" {
  name                = "io-p-itn-auth-error-ag-01"
  resource_group_name = "io-p-itn-auth-common-rg-01"
}

data "azurerm_log_analytics_workspace" "log" {
  name                = format("%s-itn-common-log-01", local.project)
  resource_group_name = local.common_resource_group_name_itn
}

data "azurerm_key_vault_secret" "common_SESSION_ST_CONNECTION_STRING" {
  name         = "common-kv-session-st-connection-string"
  key_vault_id = data.azurerm_key_vault.common.id
}
