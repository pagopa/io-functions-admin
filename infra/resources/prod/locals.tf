locals {
  prefix    = "io"
  env_short = "p"

  location       = "italynorth"
  location_short = "itn"

  common_project = "${local.prefix}-${local.env_short}"

  project        = "${local.prefix}-${local.env_short}-${local.location_short}"
  project_legacy = "${local.prefix}-${local.env_short}"

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
