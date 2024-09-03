terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "<= 3.100.0"
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

module "federated_identities" {
  source = "github.com/pagopa/dx//infra/modules/azure_federated_identity_with_github?ref=main"

  prefix    = local.prefix
  env_short = local.env_short
  env       = local.env
  domain    = local.domain

  repositories = [local.repo_name]

  continuos_integration = {
    enable = false
  }

  continuos_delivery = {
    enable = true
    roles = {
      subscription = [
        "Contributor",
      ]
      # "Storage Blob Data Contributor",
      # "Storage File Data SMB Share Contributor",
      # "Storage Queue Data Contributor",
      # "Storage Table Data Contributor",
      # "Key Vault Contributor",
      resource_groups = {
        terraform-state-rg = [
          "Storage Blob Data Contributor"
        ]
      }
    }
  }

  tags = local.tags
}
