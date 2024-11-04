
module "apim_itn" {
  source = "../_modules/apim_itn"

  apim_name                = data.azurerm_api_management.apim_itn.name
  apim_resource_group_name = data.azurerm_api_management.apim_itn.resource_group_name

  key_vault_common_id = data.azurerm_key_vault.common.id
}
