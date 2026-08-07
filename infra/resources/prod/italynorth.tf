module "apim_itn" {
  source = "../_modules/apim"

  apim_name                = data.azurerm_api_management.apim_itn.name
  apim_resource_group_name = data.azurerm_api_management.apim_itn.resource_group_name

  key_vault_common_id = data.azurerm_key_vault.common.id
}

resource "azurerm_resource_group" "function_admin_itn_rg" {
  name     = "${local.project}-platform-admin-rg-01"
  location = local.location

  tags = local.tags
}

module "function_app_admin_itn" {
  source                                     = "../_modules/function_app_admin"
  prefix                                     = local.prefix
  env_short                                  = local.env_short
  resource_group_name                        = azurerm_resource_group.function_admin_itn_rg.name
  vnet_common_name_itn                       = local.vnet_common_name_itn
  common_resource_group_name_itn             = local.common_resource_group_name_itn
  project_itn                                = local.project
  admin_snet_cidr                            = local.cidr_subnet
  cosmos_db_attributes                       = local.platform_data_platform.cosmos_api.weu
  application_insights_error_action_group_id = local.platform_observability.monitoring_westeurope.action_groups.error
  application_insights_instrumentation_key   = local.platform_observability.monitoring_westeurope.appi_instrumentation_key
  application_insights_id                    = local.platform_observability.monitoring_westeurope.appi.id
  tags                                       = local.tags
}
