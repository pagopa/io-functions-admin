# Use this file to import the wanted resources inside the state file, 
# remember to cleanup the import code blocks with a separate PR once the import has been completed successfully.
# Here is the documentation which explains how to use the import code block: https://developer.hashicorp.com/terraform/language/block/import

import {
  to = azurerm_resource_group.function_admin_itn_rg
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01"
}

import {
  to = module.function_app_admin_itn.azurerm_key_vault_access_policy.function_admin_itn_kv_common
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-rg-common/providers/Microsoft.KeyVault/vaults/io-p-kv-common/objectId/0b01ad99-6ef6-4900-99d7-1e0e63674a35"
}

import {
  to = module.function_app_admin_itn.azurerm_key_vault_access_policy.function_admin_itn_slot_staging_kv_common
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-rg-common/providers/Microsoft.KeyVault/vaults/io-p-kv-common/objectId/edbf620f-861b-46b2-8e94-26dc3088a444"
}

import {
  to = module.function_app_admin_itn.azurerm_monitor_autoscale_setting.function_admin
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Insights/autoScaleSettings/io-p-itn-admin-func-01-autoscale"
}

import {
  to = module.function_app_admin_itn.azurerm_monitor_scheduled_query_rules_alert_v2.alert_failed_delete_procedure
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Insights/scheduledQueryRules/[IO-AUTH | io-p-itn-admin-func-01] Found one or more failed DELETE procedures"
}

import {
  to = module.function_app_admin_itn.azurerm_monitor_scheduled_query_rules_alert_v2.alert_failed_download_procedure
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Insights/scheduledQueryRules/[IO-AUTH | io-p-itn-admin-func-01] Found one or more failed DOWNLOAD procedures"
}

import {
  to = module.function_app_admin_itn.azurerm_storage_management_policy.user_data_download_container_rule
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnusrdatadwnldst01/managementPolicies/default"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_linux_function_app.this
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Web/sites/io-p-itn-admin-func-01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_linux_function_app_slot.this["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Web/sites/io-p-itn-admin-func-01/slots/staging"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_monitor_metric_alert.function_app_health_check["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Insights/metricAlerts/[io-p-itn-admin-func-01] Health Check Failed"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_monitor_metric_alert.storage_account_health_check["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Insights/metricAlerts/[iopitnadminstfn01] Low Availability"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_private_endpoint.function_sites
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Network/privateEndpoints/io-p-itn-admin-func-pep-01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_private_endpoint.st_blob
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Network/privateEndpoints/io-p-itn-admin-func-blob-pep-01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_private_endpoint.st_file
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Network/privateEndpoints/io-p-itn-admin-func-file-pep-01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_private_endpoint.st_queue
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Network/privateEndpoints/io-p-itn-admin-func-queue-pep-01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_private_endpoint.staging_function_sites["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Network/privateEndpoints/io-p-itn-admin-staging-func-pep-01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_private_endpoint.std_blob["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Network/privateEndpoints/io-p-itn-admin-dfunc-blob-pep-01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_private_endpoint.std_file["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Network/privateEndpoints/io-p-itn-admin-dfunc-file-pep-01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_private_endpoint.std_queue["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Network/privateEndpoints/io-p-itn-admin-dfunc-queue-pep-01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_private_endpoint.std_table["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Network/privateEndpoints/io-p-itn-admin-dfunc-table-pep-01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_role_assignment.durable_function_storage_blob_data_contributor["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfd01/providers/Microsoft.Authorization/roleAssignments/1344b42e-9ce5-aad4-9b5f-bfdf4c0afab5"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_role_assignment.durable_function_storage_queue_data_contributor["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfd01/providers/Microsoft.Authorization/roleAssignments/992891ce-cde4-c980-9596-27e3ad729e2f"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_role_assignment.durable_function_storage_table_data_contributor["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfd01/providers/Microsoft.Authorization/roleAssignments/538cf6c4-e431-ac71-6660-32a6efae3a54"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_role_assignment.function_storage_account_contributor
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfn01/providers/Microsoft.Authorization/roleAssignments/07f3084d-4635-776e-dae0-ecc9a73234ba"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_role_assignment.function_storage_blob_data_owner
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfn01/providers/Microsoft.Authorization/roleAssignments/b7d00293-e43f-fbc5-a1ec-f586508732aa"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_role_assignment.function_storage_queue_data_contributor
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfn01/providers/Microsoft.Authorization/roleAssignments/bd45a522-3045-7719-151c-747a5b5620da"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_role_assignment.staging_durable_function_storage_blob_data_contributor["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfd01/providers/Microsoft.Authorization/roleAssignments/64e71f70-bc83-9071-9b01-326919c38e64"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_role_assignment.staging_durable_function_storage_queue_data_contributor["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfd01/providers/Microsoft.Authorization/roleAssignments/8c0a0a33-5d56-59f1-6a82-a77594cccd83"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_role_assignment.staging_durable_function_storage_table_data_contributor["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfd01/providers/Microsoft.Authorization/roleAssignments/9468739c-eba0-9d18-c1d5-8f3514e17567"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_role_assignment.staging_function_storage_account_contributor["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfn01/providers/Microsoft.Authorization/roleAssignments/64488c6a-978d-ab02-f80d-021f4b3a7e77"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_role_assignment.staging_function_storage_blob_data_owner["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfn01/providers/Microsoft.Authorization/roleAssignments/11d03144-fd94-9e74-0eb0-f69d584bab5d"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_role_assignment.staging_function_storage_queue_data_contributor["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfn01/providers/Microsoft.Authorization/roleAssignments/536864fd-3181-a6cd-e6ee-6214a48cf178"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_service_plan.this["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Web/serverFarms/io-p-itn-admin-asp-01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_storage_account.durable_function["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfd01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_storage_account.this
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfn01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_storage_account_network_rules.st_network_rules
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfn01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_storage_account_network_rules.std_network_rules["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminstfd01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_itn.azurerm_subnet.this["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-common-rg-01/providers/Microsoft.Network/virtualNetworks/io-p-itn-common-vnet-01/subnets/io-p-itn-admin-func-snet-01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_storage_account.azurerm_monitor_metric_alert.storage_account_health_check["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Insights/metricAlerts/[iopitnadminst01] Low Availability"
}

import {
  to = module.function_app_admin_itn.module.function_admin_storage_account.azurerm_private_endpoint.this["blob"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Network/privateEndpoints/io-p-itn-admin-blob-pep-01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_storage_account.azurerm_private_endpoint.this["queue"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Network/privateEndpoints/io-p-itn-admin-queue-pep-01"
}

import {
  to = module.function_app_admin_itn.module.function_admin_storage_account.azurerm_storage_account.this
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnadminst01"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_key_vault_key.key["kv"]
  id = "https://io-p-itn-platform-kv-01.vault.azure.net/keys/iopitnuserbackupsstcmk01/b75d6ade90464891b7cde22e210b6ac1"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_monitor_diagnostic_setting.blob_service["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnuserbackupsst01/blobServices/default|iopitnuserbackupsst01-blob-diagnostics"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_monitor_diagnostic_setting.queue_service["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnuserbackupsst01/queueServices/default|iopitnuserbackupsst01-queue-diagnostics"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_monitor_diagnostic_setting.storage_account["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnuserbackupsst01|iopitnuserbackupsst01-diagnostics"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_monitor_metric_alert.storage_account_health_check["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Insights/metricAlerts/[iopitnuserbackupsst01] Low Availability"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_private_endpoint.this["blob"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Network/privateEndpoints/io-p-itn-userbackups-blob-pep-01"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_private_endpoint.this["queue"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Network/privateEndpoints/io-p-itn-userbackups-queue-pep-01"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_role_assignment.keys["kv"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-common-rg-01/providers/Microsoft.KeyVault/vaults/io-p-itn-platform-kv-01/providers/Microsoft.Authorization/roleAssignments/a77e46d7-adfd-4615-dd68-d5948f18fabc"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_storage_account.secondary_replica["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnuserbackupsrepst01"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_storage_account.this
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnuserbackupsst01"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_storage_account_customer_managed_key.kv["kv"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnuserbackupsst01"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_storage_container.replica["user-data-backup"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnuserbackupsrepst01/blobServices/default/containers/user-data-backup"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_storage_container.this["user-data-backup"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnuserbackupsst01/blobServices/default/containers/user-data-backup"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_storage_management_policy.lifecycle_audit["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnuserbackupsst01/managementPolicies/default"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_storage_management_policy.secondary_lifecycle_audit["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnuserbackupsrepst01/managementPolicies/default"
}

import {
  to = module.function_app_admin_itn.module.user_data_backups_storage_account.azurerm_storage_object_replication.geo_replication_policy["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnuserbackupsst01/objectReplicationPolicies/77910735-64ad-4d64-b63e-c39d80249ec5;/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnuserbackupsrepst01/objectReplicationPolicies/77910735-64ad-4d64-b63e-c39d80249ec5"
}

import {
  to = module.function_app_admin_itn.module.user_data_download_storage_account.azurerm_monitor_metric_alert.storage_account_health_check["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Insights/metricAlerts/[iopitnusrdatadwnldst01] Low Availability"
}

import {
  to = module.function_app_admin_itn.module.user_data_download_storage_account.azurerm_security_center_storage_defender.this["0"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnusrdatadwnldst01"
}

import {
  to = module.function_app_admin_itn.module.user_data_download_storage_account.azurerm_storage_account.this
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnusrdatadwnldst01"
}

import {
  to = module.function_app_admin_itn.module.user_data_download_storage_account.azurerm_storage_container.this["user-data-download"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-admin-rg-01/providers/Microsoft.Storage/storageAccounts/iopitnusrdatadwnldst01/blobServices/default/containers/user-data-download"
}
