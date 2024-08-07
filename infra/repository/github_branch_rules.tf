resource "github_branch_default" "default_master" {
  repository = github_repository.this.name
  branch     = "master"
}

resource "github_branch_protection" "master" {
  repository_id = data.github_repository.this.node_id
  pattern       = "master"

  force_push_bypassers = []

  required_status_checks {
    strict   = false
    contexts = ["io-functions-admin.code-review"]
  }

  require_conversation_resolution = false
  required_linear_history         = false

  #tfsec:ignore:github-branch_protections-require_signed_commits
  require_signed_commits = false

  required_pull_request_reviews {
    dismiss_stale_reviews           = false
    require_code_owner_reviews      = false
    required_approving_review_count = 1
    # pull_request_bypassers = []
    # dismissal_restrictions = []
    restrict_dismissals = false
  }

  allows_deletions = false
}
