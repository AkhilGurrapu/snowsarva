"""
Notification System for SnowSarva Data Quality Alerts
=====================================================

This module implements notification and alerting capabilities inspired by elementary-data,
including Slack integration, email notifications, and webhook support.
"""

import json
import logging
import os
import requests
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class NotificationChannel(Enum):
    """Supported notification channels"""
    SLACK = "slack"
    EMAIL = "email"
    WEBHOOK = "webhook"
    TEAMS = "teams"


@dataclass
class NotificationConfig:
    """Configuration for notification channels"""
    channel: NotificationChannel
    endpoint: str
    headers: Optional[Dict[str, str]] = None
    enabled: bool = True
    filter_severity: List[str] = None  # ["error", "warning"] or None for all
    

@dataclass
class AlertNotification:
    """Alert notification payload"""
    alert_id: str
    alert_type: str
    table_name: str
    metric_name: str
    severity: str
    current_value: float
    expected_range: tuple
    description: str
    detected_at: datetime
    environment: str = "production"


class SlackNotifier:
    """Slack notification integration"""
    
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url
    
    def send_alert(self, notification: AlertNotification) -> bool:
        """Send alert to Slack channel"""
        try:
            # Determine color based on severity
            color_map = {
                "error": "#FF0000",  # Red
                "warning": "#FFA500",  # Orange
                "info": "#36A64F"  # Green
            }
            color = color_map.get(notification.severity, "#808080")
            
            # Create Slack attachment
            attachment = {
                "color": color,
                "title": f"🚨 Data Quality Alert: {notification.alert_type.replace('_', ' ').title()}",
                "title_link": f"#/alerts/{notification.alert_id}",  # Link to SnowSarva alert detail
                "text": notification.description,
                "fields": [
                    {
                        "title": "Table",
                        "value": notification.table_name,
                        "short": True
                    },
                    {
                        "title": "Metric",
                        "value": notification.metric_name,
                        "short": True
                    },
                    {
                        "title": "Current Value",
                        "value": f"{notification.current_value:.4f}",
                        "short": True
                    },
                    {
                        "title": "Expected Range",
                        "value": f"{notification.expected_range[0]:.4f} - {notification.expected_range[1]:.4f}",
                        "short": True
                    },
                    {
                        "title": "Severity",
                        "value": notification.severity.upper(),
                        "short": True
                    },
                    {
                        "title": "Environment",
                        "value": notification.environment,
                        "short": True
                    }
                ],
                "footer": "SnowSarva Data Observability",
                "footer_icon": "https://snowflake.com/favicon.ico",
                "ts": int(notification.detected_at.timestamp())
            }
            
            # Create Slack payload
            payload = {
                "text": f"Data Quality Alert in {notification.environment}",
                "attachments": [attachment],
                "username": "SnowSarva",
                "icon_emoji": ":warning:"
            }
            
            # Send to Slack
            response = requests.post(
                self.webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            if response.status_code == 200:
                logger.info(f"Successfully sent Slack notification for alert {notification.alert_id}")
                return True
            else:
                logger.error(f"Failed to send Slack notification: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending Slack notification: {str(e)}")
            return False
    
    def send_summary_report(self, alerts_summary: Dict[str, Any]) -> bool:
        """Send daily/weekly summary report to Slack"""
        try:
            total_alerts = alerts_summary.get("total_alerts", 0)
            error_count = alerts_summary.get("error_alerts", 0)
            warning_count = alerts_summary.get("warning_alerts", 0)
            tables_affected = alerts_summary.get("tables_affected", 0)
            
            # Create summary message
            if total_alerts == 0:
                text = "✅ No data quality alerts in the last 24 hours"
                color = "#36A64F"
            else:
                text = f"📊 Data Quality Summary: {total_alerts} alerts detected"
                color = "#FFA500" if error_count > 0 else "#36A64F"
            
            attachment = {
                "color": color,
                "title": "SnowSarva Data Quality Daily Summary",
                "fields": [
                    {
                        "title": "Total Alerts",
                        "value": str(total_alerts),
                        "short": True
                    },
                    {
                        "title": "Error Alerts",
                        "value": str(error_count),
                        "short": True
                    },
                    {
                        "title": "Warning Alerts",
                        "value": str(warning_count),
                        "short": True
                    },
                    {
                        "title": "Tables Affected",
                        "value": str(tables_affected),
                        "short": True
                    }
                ],
                "footer": "SnowSarva Data Observability",
                "ts": int(datetime.utcnow().timestamp())
            }
            
            payload = {
                "text": text,
                "attachments": [attachment],
                "username": "SnowSarva",
                "icon_emoji": ":bar_chart:"
            }
            
            response = requests.post(
                self.webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            return response.status_code == 200
            
        except Exception as e:
            logger.error(f"Error sending Slack summary: {str(e)}")
            return False


class TeamsNotifier:
    """Microsoft Teams notification integration"""
    
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url
    
    def send_alert(self, notification: AlertNotification) -> bool:
        """Send alert to Teams channel"""
        try:
            # Create Teams adaptive card
            card = {
                "type": "message",
                "attachments": [
                    {
                        "contentType": "application/vnd.microsoft.card.adaptive",
                        "content": {
                            "type": "AdaptiveCard",
                            "version": "1.2",
                            "body": [
                                {
                                    "type": "TextBlock",
                                    "text": f"🚨 Data Quality Alert",
                                    "weight": "Bolder",
                                    "size": "Medium",
                                    "color": "Attention" if notification.severity == "error" else "Warning"
                                },
                                {
                                    "type": "TextBlock",
                                    "text": notification.description,
                                    "wrap": True
                                },
                                {
                                    "type": "FactSet",
                                    "facts": [
                                        {
                                            "title": "Table:",
                                            "value": notification.table_name
                                        },
                                        {
                                            "title": "Metric:",
                                            "value": notification.metric_name
                                        },
                                        {
                                            "title": "Current Value:",
                                            "value": f"{notification.current_value:.4f}"
                                        },
                                        {
                                            "title": "Expected Range:",
                                            "value": f"{notification.expected_range[0]:.4f} - {notification.expected_range[1]:.4f}"
                                        },
                                        {
                                            "title": "Severity:",
                                            "value": notification.severity.upper()
                                        },
                                        {
                                            "title": "Detected At:",
                                            "value": notification.detected_at.strftime("%Y-%m-%d %H:%M:%S UTC")
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                ]
            }
            
            response = requests.post(
                self.webhook_url,
                json=card,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            return response.status_code == 200
            
        except Exception as e:
            logger.error(f"Error sending Teams notification: {str(e)}")
            return False


class WebhookNotifier:
    """Generic webhook notification"""
    
    def __init__(self, webhook_url: str, headers: Optional[Dict[str, str]] = None):
        self.webhook_url = webhook_url
        self.headers = headers or {"Content-Type": "application/json"}
    
    def send_alert(self, notification: AlertNotification) -> bool:
        """Send alert to webhook endpoint"""
        try:
            payload = {
                "event_type": "data_quality_alert",
                "alert_id": notification.alert_id,
                "alert_type": notification.alert_type,
                "table_name": notification.table_name,
                "metric_name": notification.metric_name,
                "severity": notification.severity,
                "current_value": notification.current_value,
                "expected_range": notification.expected_range,
                "description": notification.description,
                "detected_at": notification.detected_at.isoformat(),
                "environment": notification.environment
            }
            
            response = requests.post(
                self.webhook_url,
                json=payload,
                headers=self.headers,
                timeout=30
            )
            
            return response.status_code in [200, 201, 202]
            
        except Exception as e:
            logger.error(f"Error sending webhook notification: {str(e)}")
            return False


class NotificationManager:
    """Manages multiple notification channels and routing"""
    
    def __init__(self):
        self.channels: List[NotificationConfig] = []
        self.notifiers = {}
    
    def add_slack_channel(self, webhook_url: str, filter_severity: List[str] = None) -> bool:
        """Add Slack notification channel"""
        try:
            config = NotificationConfig(
                channel=NotificationChannel.SLACK,
                endpoint=webhook_url,
                filter_severity=filter_severity
            )
            self.channels.append(config)
            self.notifiers[len(self.channels) - 1] = SlackNotifier(webhook_url)
            return True
        except Exception as e:
            logger.error(f"Failed to add Slack channel: {str(e)}")
            return False
    
    def add_teams_channel(self, webhook_url: str, filter_severity: List[str] = None) -> bool:
        """Add Teams notification channel"""
        try:
            config = NotificationConfig(
                channel=NotificationChannel.TEAMS,
                endpoint=webhook_url,
                filter_severity=filter_severity
            )
            self.channels.append(config)
            self.notifiers[len(self.channels) - 1] = TeamsNotifier(webhook_url)
            return True
        except Exception as e:
            logger.error(f"Failed to add Teams channel: {str(e)}")
            return False
    
    def add_webhook_channel(self, webhook_url: str, headers: Dict[str, str] = None, filter_severity: List[str] = None) -> bool:
        """Add generic webhook notification channel"""
        try:
            config = NotificationConfig(
                channel=NotificationChannel.WEBHOOK,
                endpoint=webhook_url,
                headers=headers,
                filter_severity=filter_severity
            )
            self.channels.append(config)
            self.notifiers[len(self.channels) - 1] = WebhookNotifier(webhook_url, headers)
            return True
        except Exception as e:
            logger.error(f"Failed to add webhook channel: {str(e)}")
            return False
    
    def send_alert_notification(self, notification: AlertNotification) -> Dict[str, bool]:
        """Send alert to all configured channels"""
        results = {}
        
        for i, config in enumerate(self.channels):
            if not config.enabled:
                continue
                
            # Apply severity filter
            if config.filter_severity and notification.severity not in config.filter_severity:
                continue
            
            notifier = self.notifiers.get(i)
            if notifier:
                try:
                    success = notifier.send_alert(notification)
                    results[f"{config.channel.value}_{i}"] = success
                except Exception as e:
                    logger.error(f"Notification failed for channel {config.channel.value}: {str(e)}")
                    results[f"{config.channel.value}_{i}"] = False
        
        return results
    
    def send_summary_report(self, alerts_summary: Dict[str, Any]) -> Dict[str, bool]:
        """Send summary report to Slack channels"""
        results = {}
        
        for i, config in enumerate(self.channels):
            if not config.enabled or config.channel != NotificationChannel.SLACK:
                continue
            
            notifier = self.notifiers.get(i)
            if isinstance(notifier, SlackNotifier):
                try:
                    success = notifier.send_summary_report(alerts_summary)
                    results[f"slack_summary_{i}"] = success
                except Exception as e:
                    logger.error(f"Summary report failed for Slack channel: {str(e)}")
                    results[f"slack_summary_{i}"] = False
        
        return results
    
    def load_config_from_env(self) -> bool:
        """Load notification configuration from environment variables"""
        try:
            # Slack configuration
            slack_webhook = os.getenv("SNOWSARVA_SLACK_WEBHOOK_URL")
            if slack_webhook:
                severity_filter = os.getenv("SNOWSARVA_SLACK_SEVERITY_FILTER", "error,warning").split(",")
                self.add_slack_channel(slack_webhook, severity_filter)
            
            # Teams configuration
            teams_webhook = os.getenv("SNOWSARVA_TEAMS_WEBHOOK_URL")
            if teams_webhook:
                severity_filter = os.getenv("SNOWSARVA_TEAMS_SEVERITY_FILTER", "error,warning").split(",")
                self.add_teams_channel(teams_webhook, severity_filter)
            
            # Generic webhook configuration
            generic_webhook = os.getenv("SNOWSARVA_WEBHOOK_URL")
            if generic_webhook:
                headers = {}
                auth_header = os.getenv("SNOWSARVA_WEBHOOK_AUTH_HEADER")
                if auth_header:
                    headers["Authorization"] = auth_header
                
                severity_filter = os.getenv("SNOWSARVA_WEBHOOK_SEVERITY_FILTER", "error,warning").split(",")
                self.add_webhook_channel(generic_webhook, headers, severity_filter)
            
            logger.info(f"Loaded {len(self.channels)} notification channels from environment")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load notification config from environment: {str(e)}")
            return False
    
    def test_channels(self) -> Dict[str, bool]:
        """Test all configured notification channels"""
        test_notification = AlertNotification(
            alert_id="test-alert-" + datetime.utcnow().strftime("%Y%m%d%H%M%S"),
            alert_type="test_alert",
            table_name="TEST.PUBLIC.SAMPLE_TABLE",
            metric_name="test_metric",
            severity="info",
            current_value=100.0,
            expected_range=(90.0, 110.0),
            description="This is a test alert from SnowSarva notification system",
            detected_at=datetime.utcnow(),
            environment="test"
        )
        
        return self.send_alert_notification(test_notification)


class AlertRule:
    """Alert rule configuration for automated notifications"""
    
    def __init__(self, rule_id: str, conditions: Dict[str, Any], actions: List[str]):
        self.rule_id = rule_id
        self.conditions = conditions
        self.actions = actions
        self.enabled = True
    
    def matches(self, notification: AlertNotification) -> bool:
        """Check if notification matches rule conditions"""
        try:
            # Check severity condition
            if "severity" in self.conditions:
                if notification.severity not in self.conditions["severity"]:
                    return False
            
            # Check table pattern condition
            if "table_pattern" in self.conditions:
                import re
                pattern = self.conditions["table_pattern"]
                if not re.match(pattern, notification.table_name):
                    return False
            
            # Check metric type condition
            if "metric_types" in self.conditions:
                if notification.alert_type not in self.conditions["metric_types"]:
                    return False
            
            # Check environment condition
            if "environments" in self.conditions:
                if notification.environment not in self.conditions["environments"]:
                    return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error evaluating alert rule {self.rule_id}: {str(e)}")
            return False


class AlertRouter:
    """Routes alerts based on configured rules"""
    
    def __init__(self, notification_manager: NotificationManager):
        self.notification_manager = notification_manager
        self.rules: List[AlertRule] = []
    
    def add_rule(self, rule: AlertRule):
        """Add alert routing rule"""
        self.rules.append(rule)
    
    def route_alert(self, notification: AlertNotification) -> Dict[str, Any]:
        """Route alert based on configured rules"""
        matched_rules = []
        notification_results = {}
        
        # Find matching rules
        for rule in self.rules:
            if rule.enabled and rule.matches(notification):
                matched_rules.append(rule)
        
        # If no rules match, use default routing (all channels)
        if not matched_rules:
            notification_results = self.notification_manager.send_alert_notification(notification)
        else:
            # Apply rule-based routing
            for rule in matched_rules:
                if "notify_all" in rule.actions:
                    results = self.notification_manager.send_alert_notification(notification)
                    notification_results.update(results)
                # Additional rule actions can be implemented here
        
        return {
            "matched_rules": [rule.rule_id for rule in matched_rules],
            "notification_results": notification_results,
            "total_channels_notified": len([r for r in notification_results.values() if r])
        }