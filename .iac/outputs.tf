output "service_url" {
  description = "URL of the MCP service"
  value       = module.mcp-service.service_url
}

output "service_name" {
  description = "Name of the ECS service"
  value       = module.mcp-service.service_name
}

output "task_definition_arn" {
  description = "ARN of the ECS task definition"
  value       = module.mcp-service.task_definition_arn
}
