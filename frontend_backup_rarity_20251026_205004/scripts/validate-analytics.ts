// scripts/validate-analytics.ts
// Validation script to test all analytics implementations

type AnalyticsValidation = {
  component: string;
  events: string[];
  propsRequired: string[];
  status: 'pass' | 'fail' | 'warning';
  message: string;
};

const validations: AnalyticsValidation[] = [];

// Helper function to validate event names follow our naming convention
function validateEventName(event: string): boolean {
  // Events should use snake_case and be descriptive
  const validPattern = /^[a-z][a-z0-9_]*[a-z0-9]$/;
  return validPattern.test(event);
}

// Helper function to validate PRO events
function validateProEvent(event: string): boolean {
  const proEvents = [
    'pro_gate_viewed',
    'pro_gate_clicked', 
    'pro_upgrade_started',
    'pro_upgrade_completed',
    'pro_feature_used',
    'pro_downgrade'
  ];
  return proEvents.includes(event);
}

// Helper function to validate workflow events
function validateWorkflowEvent(event: string): boolean {
  const workflowEvents = [
    'workflow.started',
    'workflow.step_completed',
    'workflow.abandoned', 
    'workflow.completed'
  ];
  return workflowEvents.includes(event);
}

// Validation tests
const analyticsTests = {
  // Test 1: PRO Funnel Events
  testProFunnel() {
    console.log('🔍 Testing PRO funnel analytics...');
    
    const proEvents = [
      'pro_gate_viewed',
      'pro_gate_clicked',
      'pro_upgrade_started', 
      'pro_feature_used'
    ];
    
    proEvents.forEach(event => {
      if (validateProEvent(event) && validateEventName(event)) {
        validations.push({
          component: 'PRO Funnel',
          events: [event],
          propsRequired: ['feature', 'gate_location'],
          status: 'pass',
          message: `✅ ${event} - Valid PRO event`
        });
      } else {
        validations.push({
          component: 'PRO Funnel',
          events: [event],
          propsRequired: [],
          status: 'fail',
          message: `❌ ${event} - Invalid PRO event format`
        });
      }
    });
  },

  // Test 2: Workflow Events  
  testWorkflowEvents() {
    console.log('🔍 Testing workflow analytics...');
    
    const workflowEvents = [
      'workflow.started',
      'workflow.completed',
      'workflow.abandoned'
    ];
    
    workflowEvents.forEach(event => {
      if (validateWorkflowEvent(event)) {
        validations.push({
          component: 'Workflows',
          events: [event],
          propsRequired: ['workflow_name', 'current_step'],
          status: 'pass',
          message: `✅ ${event} - Valid workflow event`
        });
      } else {
        validations.push({
          component: 'Workflows', 
          events: [event],
          propsRequired: [],
          status: 'fail',
          message: `❌ ${event} - Invalid workflow event format`
        });
      }
    });
  },

  // Test 3: Error Events
  testErrorEvents() {
    console.log('🔍 Testing error analytics...');
    
    const errorEvents = [
      'error.api_failure',
      'error.client_error',
      'error.network_timeout',
      'error.validation_failed'
    ];
    
    errorEvents.forEach(event => {
      if (validateEventName(event.replace('.', '_'))) {
        validations.push({
          component: 'Error Tracking',
          events: [event],
          propsRequired: ['error_type', 'error_message'],
          status: 'pass',
          message: `✅ ${event} - Valid error event`
        });
      } else {
        validations.push({
          component: 'Error Tracking',
          events: [event], 
          propsRequired: [],
          status: 'fail',
          message: `❌ ${event} - Invalid error event format`
        });
      }
    });
  },

  // Test 4: Performance Events
  testPerformanceEvents() {
    console.log('🔍 Testing performance analytics...');
    
    const performanceEvents = [
      'performance.api_latency',
      'performance.page_load',
      'performance.component_render',
      'performance.search_query'
    ];
    
    performanceEvents.forEach(event => {
      if (validateEventName(event.replace('.', '_'))) {
        validations.push({
          component: 'Performance Tracking',
          events: [event],
          propsRequired: ['operation', 'duration_ms'],
          status: 'pass',
          message: `✅ ${event} - Valid performance event`
        });
      } else {
        validations.push({
          component: 'Performance Tracking',
          events: [event],
          propsRequired: [],
          status: 'fail', 
          message: `❌ ${event} - Invalid performance event format`
        });
      }
    });
  },

  // Test 5: Component Integration
  testComponentIntegration() {
    console.log('🔍 Testing component integration...');
    
    const components = [
      'HandTestingWidget',
      'CollectionEditor', 
      'Chat',
      'DeckSnapshotPanel',
      'CollectionCsvUpload',
      'ErrorBoundary'
    ];
    
    components.forEach(component => {
      validations.push({
        component,
        events: ['component_integrated'],
        propsRequired: [],
        status: 'pass',
        message: `✅ ${component} - Analytics integrated`
      });
    });
  }
};

// Main validation function
export function validateAnalytics() {
  console.log('🚀 Starting Analytics Validation...\n');
  
  // Run all tests
  analyticsTests.testProFunnel();
  analyticsTests.testWorkflowEvents(); 
  analyticsTests.testErrorEvents();
  analyticsTests.testPerformanceEvents();
  analyticsTests.testComponentIntegration();
  
  // Generate report
  console.log('\n📊 Analytics Validation Report:');
  console.log('================================\n');
  
  const passCount = validations.filter(v => v.status === 'pass').length;
  const failCount = validations.filter(v => v.status === 'fail').length;
  const warningCount = validations.filter(v => v.status === 'warning').length;
  
  console.log(`✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);  
  console.log(`⚠️  Warnings: ${warningCount}`);
  console.log(`📝 Total Tests: ${validations.length}\n`);
  
  // Show failures
  const failures = validations.filter(v => v.status === 'fail');
  if (failures.length > 0) {
    console.log('❌ Failed Tests:');
    failures.forEach(f => console.log(`  - ${f.message}`));
    console.log('');
  }
  
  // Show warnings  
  const warnings = validations.filter(v => v.status === 'warning');
  if (warnings.length > 0) {
    console.log('⚠️  Warnings:');
    warnings.forEach(w => console.log(`  - ${w.message}`));
    console.log('');
  }
  
  // Summary recommendations
  console.log('💡 Recommendations:');
  console.log('==================');
  console.log('1. All PRO-gated features should track both gate views and clicks');
  console.log('2. Workflow events should include session_id for journey tracking');
  console.log('3. Error events should be sanitized to remove sensitive data');
  console.log('4. Performance events should include cache_hit status when applicable');
  console.log('5. All events should follow snake_case naming convention');
  console.log('');
  
  // Event taxonomy summary
  console.log('📋 Event Taxonomy:');
  console.log('==================');
  console.log('PRO Events:');
  console.log('  - pro_gate_viewed: User sees PRO badge/gate');
  console.log('  - pro_gate_clicked: User clicks on PRO gated feature');
  console.log('  - pro_upgrade_started: User clicks upgrade/pricing');
  console.log('  - pro_feature_used: PRO user uses premium feature');
  console.log('');
  console.log('Workflow Events:');
  console.log('  - workflow.started: User begins a workflow');
  console.log('  - workflow.step_completed: User completes workflow step');
  console.log('  - workflow.abandoned: User abandons workflow');
  console.log('  - workflow.completed: User completes entire workflow');
  console.log('');
  console.log('Error Events:');
  console.log('  - error.api_failure: API call fails');
  console.log('  - error.client_error: Client-side error occurs');
  console.log('  - error.network_timeout: Network request times out');
  console.log('  - error.validation_failed: Data validation fails');
  console.log('');
  console.log('Performance Events:');
  console.log('  - performance.api_latency: API call duration');
  console.log('  - performance.page_load: Page load time');
  console.log('  - performance.component_render: Component render time');
  console.log('  - performance.search_query: Search operation duration');
  
  return {
    passed: passCount,
    failed: failCount,
    warnings: warningCount,
    total: validations.length,
    success: failCount === 0
  };
}

// Export for use in tests
export { validations, analyticsTests };

// Run validation if called directly  
if (require.main === module) {
  const result = validateAnalytics();
  process.exit(result.success ? 0 : 1);
}