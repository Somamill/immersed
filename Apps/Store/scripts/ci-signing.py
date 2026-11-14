"""Import approved credentials on an ephemeral GitHub macOS release runner."""
import base64
import os
from pathlib import Path
import plistlib
import secrets
import urllib.request
import subprocess


def run(args):
    result = subprocess.run(args, capture_output=True)
    if result.returncode:
        raise RuntimeError(f'Apple credential operation {args[1]} failed; secret arguments are redacted.')
    return result.stdout


def secret_file(variable, name):
    value = os.environ.get(variable)
    if not value:
        raise RuntimeError(f'Configure {variable} in the approved store-release GitHub environment.')
    path = root / name
    path.write_bytes(base64.b64decode(value, validate=True))
    path.chmod(0o600)
    return path


if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise RuntimeError('This helper is only for ephemeral GitHub Actions runners.')

root = Path(os.environ['RUNNER_TEMP']) / 'dot-store-signing'
root.mkdir(mode=0o700, exist_ok=True)
keychain = root / 'release.keychain-db'
password = secrets.token_urlsafe(40)
run(['security', 'create-keychain', '-p', password, str(keychain)])
with open(os.environ['GITHUB_ENV'], 'a') as environment:
    environment.write(f'DOT_SIGNING_KEYCHAIN={keychain}\n')
run(['security', 'set-keychain-settings', '-lut', '21600', str(keychain)])
run(['security', 'unlock-keychain', '-p', password, str(keychain)])
run(['security', 'list-keychains', '-d', 'user', '-s', str(keychain)])
certificates = [('APPLE_DISTRIBUTION_P12_BASE64', 'APPLE_DISTRIBUTION_PASSWORD')]
profile_variable = 'IOS_PROVISIONING_PROFILE_BASE64'
if os.environ['DOT_TARGET'] == 'macos':
    certificates.append(('MAC_INSTALLER_P12_BASE64', 'MAC_INSTALLER_PASSWORD'))
    profile_variable = 'MAC_PROVISIONING_PROFILE_BASE64'
for index, (variable, password_variable) in enumerate(certificates):
    certificate = secret_file(variable, f'certificate-{index}.p12')
    certificate_password = os.environ.get(password_variable)
    if certificate_password is None:
        raise RuntimeError(f'Configure {password_variable} in the approved store-release GitHub environment.')
    run(['security', 'import', str(certificate), '-k', str(keychain), '-P', certificate_password,
         '-T', '/usr/bin/codesign', '-T', '/usr/bin/productbuild'])
for generation in ['G3', 'G6']:
    intermediate = root / ('AppleWWDRCA' + generation + '.cer')
    urllib.request.urlretrieve('https://www.apple.com/certificateauthority/' + intermediate.name, intermediate)
    run(['security', 'import', str(intermediate), '-k', str(keychain)])
run(['security', 'set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', password, str(keychain)])
profile = secret_file(profile_variable, 'profile.provisionprofile')
decoded = plistlib.loads(run(['security', 'cms', '-D', '-i', str(profile)]))
profiles = Path.home() / 'Library/Developer/Xcode/UserData/Provisioning Profiles'
profiles.mkdir(parents=True, exist_ok=True)
destination = profiles / (decoded['UUID'] + '.provisionprofile')
destination.write_bytes(profile.read_bytes())
destination.chmod(0o600)
api_key = secret_file('ASC_API_KEY_P8_BASE64', 'api.p8')
keys = Path.home() / '.appstoreconnect/private_keys'
keys.mkdir(parents=True, mode=0o700, exist_ok=True)
key_destination = keys / ('AuthKey_' + os.environ['ASC_KEY_ID'] + '.p8')
key_destination.write_bytes(api_key.read_bytes())
key_destination.chmod(0o600)
print('Prepared temporary Apple signing identities; no credential values are logged.')
