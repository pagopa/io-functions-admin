module "tests" {
  #source = "../../../_modules/test_users"
  source = "git::https://github.com/pagopa/io-infra.git//src/_modules/test_users?ref=main"
}
