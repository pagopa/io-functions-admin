terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "<= 3.116.0"
    }
  }

  backend "azurerm" {
    resource_group_name  = "terraform-state-rg"
    storage_account_name = "tfappprodio"
    container_name       = "terraform-state"
    key                  = "io-functions-admin.identity.tfstate"
  }
}

provider "azurerm" {
  features {
  }
}


// TODO: Should be removed after the boortstrap migration is completed
module "federated_identities" {
  source = "github.com/pagopa/dx//infra/modules/azure_federated_identity_with_github?ref=8d33535137e74b9a0c9361dd145c501028982cee"

  prefix    = local.prefix
  env_short = local.env_short
  env       = local.env
  domain    = local.domain

  repositories = [local.repo_name]

  continuos_delivery = {
    enable = true
    roles = {
      subscription = [
        "Contributor",
      ]
      resource_groups = {
        terraform-state-rg = [
          "Storage Blob Data Contributor"
        ]
      }
    }
  }

  tags = local.tags
}

# The KV access policies are managed here now: https://github.com/pagopa/io-infra/blob/main/src/core/prod/westeurope.tf#L72

removed {
  from = azurerm_key_vault_access_policy.common_cd
  lifecycle {
    destroy = false
  }
}

removed {
  from = azurerm_key_vault_access_policy.common_ci
  lifecycle {
    destroy = false
  }
}
