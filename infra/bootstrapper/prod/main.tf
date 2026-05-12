terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~>4"
    }

    azuread = {
      source  = "hashicorp/azuread"
      version = "~>3"
    }

    github = {
      source  = "integrations/github"
      version = "~>6"
    }
  }

  backend "azurerm" {
    resource_group_name  = "terraform-state-rg"
    storage_account_name = "iopitntfst001"
    container_name       = "terraform-state"
    key                  = "io-functions-admin.bootstrapper.prod.tfstate"
    use_azuread_auth     = true
  }
}

provider "azurerm" {
  features {
  }
  storage_use_azuread = true
}

provider "github" {
  owner = "pagopa"
}

data "azurerm_subscription" "current" {}

data "azurerm_container_app_environment" "runner" {
  name                = local.runner.cae_name
  resource_group_name = local.runner.cae_resource_group_name
}

data "azurerm_key_vault" "common" {
  name                = local.key_vault.name
  resource_group_name = local.key_vault.resource_group_name
}

data "azurerm_resource_group" "dns_zones" {
  name = local.dns_zones.resource_group_name
}

data "azurerm_resource_group" "dashboards" {
  name = "dashboards"
}

data "azurerm_resource_group" "common_itn" {
  name = "${local.prefix}-${local.env_short}-itn-common-rg-01"
}

data "azurerm_resource_group" "fn_admin_rg" {
  name = "${local.prefix}-${local.env_short}-itn-platform-admin-rg-01"
}

data "azuread_group" "admins" {
  display_name = local.adgroups.admins_name
}

data "azuread_group" "developers" {
  display_name = local.adgroups.devs_name
}

module "repo" {
  source  = "pagopa-dx/azure-github-environment-bootstrap/azurerm"
  version = "~> 4.0"

  environment = {
    prefix          = local.prefix
    env_short       = local.env_short
    location        = local.location
    domain          = local.domain
    instance_number = local.instance_number
  }
  additional_resource_group_ids = [data.azurerm_resource_group.fn_admin_rg.id]

  entraid_groups = {
    admins_object_id = data.azuread_group.admins.object_id
    devs_object_id   = data.azuread_group.developers.object_id
  }

  terraform_storage_account = {
    name                = local.tf_storage_account.name
    resource_group_name = local.tf_storage_account.resource_group_name
  }

  repository = {
    owner = "pagopa"
    name  = local.repository.name
  }

  github_private_runner = {
    container_app_environment_id = data.azurerm_container_app_environment.runner.id

    key_vault = {
      name                = local.runner.secret.kv_name
      resource_group_name = local.runner.secret.kv_resource_group_name
    }
  }

  private_dns_zone_resource_group_id = data.azurerm_resource_group.dns_zones.id
  opex_resource_group_id             = data.azurerm_resource_group.dashboards.id

  tags = local.tags
}

resource "azurerm_key_vault_access_policy" "infra_cd_kv_common" {
  for_each = toset(local.keyvault_common_ids)

  key_vault_id = each.key
  tenant_id    = data.azurerm_subscription.current.tenant_id
  object_id    = module.repo.identities.infra.cd.principal_id

  secret_permissions = ["Get", "List", "Set"]
}

resource "azurerm_key_vault_access_policy" "infra_ci_kv_common" {
  for_each = toset(local.keyvault_common_ids)

  key_vault_id = each.key
  tenant_id    = data.azurerm_subscription.current.tenant_id
  object_id    = module.repo.identities.infra.ci.principal_id

  secret_permissions = ["Get", "List"]
}
