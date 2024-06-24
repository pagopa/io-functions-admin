resource "github_repository" "this" {
  name        = "io-functions-admin"
  description = "IO platform APIs for the Admin"

  #tfsec:ignore:github-repositories-private
  visibility = "public"

  allow_auto_merge            = true
  allow_update_branch         = false
  allow_rebase_merge          = true
  allow_merge_commit          = false
  allow_squash_merge          = true
  squash_merge_commit_title   = "COMMIT_OR_PR_TITLE"
  squash_merge_commit_message = "COMMIT_MESSAGES"

  delete_branch_on_merge = true

  has_projects    = false
  has_wiki        = false
  has_discussions = false
  has_issues      = false
  has_downloads   = true


  # topics = ["io-functions-admin", "io"]

  vulnerability_alerts = true

  # archive_on_destroy = false
}
