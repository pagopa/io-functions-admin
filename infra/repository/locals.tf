locals {
  repository = {
    name                     = "io-functions-admin"
    description              = "Functions for admin API like user profile management and services administration"
    topics                   = ["io", "functions", "admin", "api"]
    reviewers_teams          = ["io-platform-admin", "io-communication-backend", "io-auth-n-identity-backend"]
    default_branch_name      = "master"
    infra_cd_policy_branches = ["master"]
    opex_cd_policy_branches  = ["master"]
    app_cd_policy_branches   = ["master"]
    jira_boards_ids          = ["IOPLT", "IOCOM", "IOPID"]
  }
}