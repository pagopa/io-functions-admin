data "azurerm_key_vault_secret" "io_fn3_admin_key_secret_v2" {
  name         = "fn3admin-KEY-APIM"
  key_vault_id = var.key_vault_common_id
}
