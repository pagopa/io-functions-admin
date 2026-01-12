resource "azurerm_api_management_named_value" "io_fn3_admin_url_v2" {
  name                = "io-fn3-admin-url"
  api_management_name = var.apim_name
  resource_group_name = var.apim_resource_group_name
  display_name        = "io-fn3-admin-url"
  value               = "https://io-p-itn-admin-func-01.azurewebsites.net"
}

resource "azurerm_api_management_named_value" "io_fn3_admin_key_v2" {
  name                = "io-fn3-admin-key"
  api_management_name = var.apim_name
  resource_group_name = var.apim_resource_group_name
  display_name        = "io-fn3-admin-key"
  value               = data.azurerm_key_vault_secret.io_fn3_admin_key_secret_v2.value
  secret              = "true"
}
