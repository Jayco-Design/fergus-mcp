variable "deployment" {
  type        = string
  default     = "dev"
  description = "Deployment environment (dev, staging, prod)"
}

variable "manager" {
  type        = string
  default     = "local-tf"
  description = "Resource manager identifier"
}

variable "image" {
  type        = string
  description = "Docker image URI for the MCP server"
}

variable "gitref" {
  type        = string
  description = "Git reference (commit SHA or tag)"
}

variable "ecs" {
  type = object({
    cluster_name = string
    cpu          = optional(number, 256)
    memory       = optional(number, 512)
    envvars = object({
      api_port            = string
      fergus_api_base_url = string
      cognito_region      = string
      cognito_domain      = string
      oauth_redirect_uri  = string
      session_storage     = optional(string, "memory")
      redis_url_arn             = optional(string, "")
    })
  })
  description = "ECS configuration including cluster and environment variables"
}

variable "health_check_path" {
  type        = string
  default     = "/"
  description = "Health check endpoint path"
}

variable "desired_count" {
  type        = number
  default     = 1
  description = "Desired number of ECS tasks"
}

variable "scaling_min_capacity" {
  type        = number
  default     = 1
  description = "Minimum number of ECS tasks for auto-scaling"
}

variable "scaling_max_capacity" {
  type        = number
  default     = 2
  description = "Maximum number of ECS tasks for auto-scaling"
}
