locals {
  prefix    = "io"
  env_short = "p"

  location       = "italynorth"
  location_short = "itn"

  common_project = "${local.prefix}-${local.env_short}"

  project        = "${local.prefix}-${local.env_short}-${local.location_short}"
  project_legacy = "${local.prefix}-${local.env_short}"

  platform_data_platform = data.terraform_remote_state.platform_data_platform.outputs
  platform_observability = data.terraform_remote_state.platform_observability.outputs

  cidr_subnet = "10.20.34.64/26"

  vnet_common_name_itn           = "${local.project}-common-vnet-01"
  common_resource_group_name_itn = "${local.project}-common-rg-01"

  tags = {
    CostCenter     = "TS310 - PAGAMENTI & SERVIZI"
    CreatedBy      = "Terraform"
    Environment    = "Prod"
    Owner          = "IO"
    ManagementTeam = "IO Platform"
    Source         = "https://github.com/pagopa/io-functions-admin/blob/main/infra/resources/prod"
  }

  apim_itn = {
    name                = "${local.project}-apim-01"
    resource_group_name = "${local.project}-common-rg-01"
  }
}
