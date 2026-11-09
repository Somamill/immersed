Pod::Spec.new do |s|
  s.name = 'ImmersedLiveCaptions'
  s.version = '0.1.0'
  s.summary = 'On-device Japanese captions from app audio'
  s.description = s.summary
  s.license = 'MIT'
  s.author = 'Immersed'
  s.homepage = 'https://github.com/Somamill/immersed'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/Somamill/immersed.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{swift,h,m}'
  s.frameworks = 'ReplayKit', 'Speech'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
