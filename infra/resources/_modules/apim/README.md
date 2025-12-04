# apim

<!-- BEGIN_TF_DOCS -->
## Requirements

No requirements.

## Providers

| Name | Version |
|------|---------|
| <a name="provider_azurerm"></a> [azurerm](#provider\_azurerm) | 3.117.1 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_api_v2_admin"></a> [api\_v2\_admin](#module\_api\_v2\_admin) | github.com/pagopa/terraform-azurerm-v3//api_management_api | v8.27.0 |
| <a name="module_apim_v2_product_admin"></a> [apim\_v2\_product\_admin](#module\_apim\_v2\_product\_admin) | github.com/pagopa/terraform-azurerm-v3//api_management_product | v8.27.0 |

## Resources

| Name | Type |
|------|------|
| [azurerm_api_management_named_value.io_fn3_admin_key_v2](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/api_management_named_value) | resource |
| [azurerm_api_management_named_value.io_fn3_admin_url_v2](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/api_management_named_value) | resource |
| [azurerm_key_vault_secret.io_fn3_admin_key_secret_v2](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/data-sources/key_vault_secret) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_apim_name"></a> [apim\_name](#input\_apim\_name) | n/a | `string` | n/a | yes |
| <a name="input_apim_resource_group_name"></a> [apim\_resource\_group\_name](#input\_apim\_resource\_group\_name) | n/a | `string` | n/a | yes |
| <a name="input_key_vault_common_id"></a> [key\_vault\_common\_id](#input\_key\_vault\_common\_id) | n/a | `string` | n/a | yes |

## Outputs

No outputs.
<!-- END_TF_DOCS -->
