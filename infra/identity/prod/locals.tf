locals {
  prefix    = "io"
  env_short = "p"
  env       = "prod"
  project   = "${local.prefix}-${local.env_short}"
  domain    = "functions-admin"

  repo_name = "io-functions-admin"

  tags = {
    CostCenter  = "TS310 - PAGAMENTI & SERVIZI"
    CreatedBy   = "Terraform"
    Environment = "Prod"
    Owner       = "IO"
    Source      = "https://github.com/pagopa/io-functions-admin/blob/main/infra/identity/prod"
  }
}
