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

// TODO: Should be removed after the boortstrap migration is completed
resource "azurerm_key_vault_access_policy" "common_ci" {
  key_vault_id = data.azurerm_key_vault.common.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = module.federated_identities.federated_ci_identity.id

  secret_permissions = [
    "Get",
    "List"
  ]
}
// TODO: Should be removed after the boortstrap migration is completed
resource "azurerm_key_vault_access_policy" "common_cd" {
  key_vault_id = data.azurerm_key_vault.common.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = module.federated_identities.federated_cd_identity.id

  secret_permissions = [
    "Get",
    "List"
  ]
}
