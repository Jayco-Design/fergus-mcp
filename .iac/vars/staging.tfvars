deployment = "staging"
manager    = "ci-tf"

ecs = {
  cluster_name = "staging-services"
  cpu          = 256
  memory       = 512
  envvars = {
    api_port            = "8080"
    fergus_api_base_url = "https://api.sugref.com"
    cognito_region      = "ap-southeast-2"
    cognito_domain      = "auth-staging.sugref.com"
    oauth_redirect_uri  = "https://mcp.staging.sugref.com/oauth/callback"
    session_storage     = "memory"
    redis_url_arn       = ""
  }
}

health_check_path    = "/health"
desired_count        = 1
scaling_min_capacity = 1
scaling_max_capacity = 2
