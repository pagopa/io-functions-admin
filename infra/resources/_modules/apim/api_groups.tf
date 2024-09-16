module "api_v2_admin" {
  source = "github.com/pagopa/terraform-azurerm-v3//api_management_api?ref=v8.27.0"

  name                = "io-admin-api"
  api_management_name = var.apim_name
  resource_group_name = var.apim_resource_group_name
  revision            = "1"
  display_name        = "IO ADMIN API"
  description         = "ADMIN API for IO platform."

  path        = "adm"
  protocols   = ["http", "https"]
  product_ids = [module.apim_v2_product_admin.product_id]

  service_url = null

  subscription_required = true

  content_format = "swagger-json"
  content_value = templatefile("../assets/io_admin_v1_swagger.json.tpl",
    {
      host = "api.io.pagopa.it"
    }
  )

  xml_content = file("../assets/io_admin_v1_policy.xml")
}
