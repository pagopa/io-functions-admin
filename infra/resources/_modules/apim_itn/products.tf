module "apim_itn_product_admin" {
  source = "github.com/pagopa/terraform-azurerm-v3//api_management_product?ref=v8.27.0"

  product_id            = "io-admin-api"
  api_management_name   = var.apim_name
  resource_group_name   = var.apim_resource_group_name
  display_name          = "IO ADMIN API"
  description           = "ADMIN API for IO platform."
  subscription_required = true
  approval_required     = false
  published             = true

  policy_xml = file("../assets/io_admin_v1_base_policy.xml")
}
