package adb

import (
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

func run(args ...string) error {
	cmd := exec.Command("adb", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf(
			"adb %s: %s: %w",
			strings.Join(args, " "),
			string(out),
			err,
		)
	}
	return nil
}

func shell(deviceID string, command string) error {
	return run("-s", deviceID, "shell", command)
}

func SetProxy(deviceID string, host string, port int) error {
	return shell(
		deviceID,
		fmt.Sprintf("settings put global http_proxy %s:%d", host, port),
	)
}

func ClearProxy(deviceID string) error {
	return shell(deviceID, "settings put global http_proxy :0")
}

func ReversePort(deviceID string, remotePort, localPort int) error {
	return run(
		"-s",
		deviceID,
		"reverse",
		fmt.Sprintf("tcp:%d", remotePort),
		fmt.Sprintf("tcp:%d", localPort),
	)
}

func RemoveReverse(deviceID string, remotePort int) error {
	return run(
		"-s",
		deviceID,
		"reverse",
		"--remove",
		fmt.Sprintf("tcp:%d", remotePort),
	)
}

func InstallCACert(deviceID string, pemPath string) error {
	hash, err := certSubjectHash(pemPath)
	if err != nil {
		return fmt.Errorf("certSubjectHash: %w", err)
	}

	certFilename := fmt.Sprintf("%s.0", hash)
	certPath := fmt.Sprintf("/data/local/tmp/%s", certFilename)

	_ = run("-s", deviceID, "root")
	_ = run("-s", deviceID, "wait-for-device")

	if err := run("-s", deviceID, "push", pemPath, certPath); err != nil {
		return fmt.Errorf("push cert: %w", err)
	}

	script := fmt.Sprintf(`set -e

do_mount() {
  "$@" 2>/dev/null && return 0
  mount -o remount,rw / 2>/dev/null
  touch /etc/fstab 2>/dev/null
  "$@" && return 0
  busybox "$@" && return 0
  return 1
}

mkdir -p /data/local/tmp/htk-ca-copy
chmod 700 /data/local/tmp/htk-ca-copy
rm -rf /data/local/tmp/htk-ca-copy/*

if [ -d "/apex/com.android.conscrypt/cacerts" ]; then
    cp /apex/com.android.conscrypt/cacerts/* /data/local/tmp/htk-ca-copy/
else
    cp /system/etc/security/cacerts/* /data/local/tmp/htk-ca-copy/
fi

do_mount mount -t tmpfs tmpfs /system/etc/security/cacerts

mv /data/local/tmp/htk-ca-copy/* /system/etc/security/cacerts/
mv %s /system/etc/security/cacerts/

chown root:root /system/etc/security/cacerts/*
chmod 644 /system/etc/security/cacerts/*
chcon u:object_r:system_file:s0 /system/etc/security/cacerts/
chcon u:object_r:system_file:s0 /system/etc/security/cacerts/*

echo 'System cacerts setup completed'

if [ -d "/apex/com.android.conscrypt/cacerts" ]; then
    do_mount mount --bind /system/etc/security/cacerts /apex/com.android.conscrypt/cacerts

    ZYGOTE_PID=$(pidof zygote || true)
    ZYGOTE64_PID=$(pidof zygote64 || true)
    Z_PIDS="$ZYGOTE_PID $ZYGOTE64_PID"

    for Z_PID in $Z_PIDS; do
        if [ -n "$Z_PID" ]; then
            nsenter --mount=/proc/$Z_PID/ns/mnt -- \
                /bin/mount --bind /system/etc/security/cacerts /apex/com.android.conscrypt/cacerts
        fi
    done

    APP_PIDS=$(
        echo $Z_PIDS | \
        xargs -n1 ps -o 'PID' -P | \
        grep -v PID
    )

    for PID in $APP_PIDS; do
        nsenter --mount=/proc/$PID/ns/mnt -- \
            /bin/mount --bind /system/etc/security/cacerts /apex/com.android.conscrypt/cacerts &
    done
    wait
fi

rm -rf /data/local/tmp/htk-ca-copy

echo 'System cert successfully injected'
`, certPath)

	scriptPath := "/data/local/tmp/jb-inject-cert.sh"
	scriptLocal, err := os.CreateTemp("", "jb-inject-cert-*.sh")
	if err != nil {
		return fmt.Errorf("create temp script: %w", err)
	}
	defer os.Remove(scriptLocal.Name())

	if _, err := scriptLocal.WriteString(script); err != nil {
		scriptLocal.Close()
		return fmt.Errorf("write script: %w", err)
	}
	scriptLocal.Close()

	if err := run("-s", deviceID, "push", scriptLocal.Name(), scriptPath); err != nil {
		return fmt.Errorf("push script: %w", err)
	}

	cmd := exec.Command(
		"adb", "-s", deviceID, "shell", "sh", scriptPath,
	)
	out, err := cmd.CombinedOutput()
	output := string(out)

	if err != nil &&
		!strings.Contains(output, "System cert successfully injected") {
		suCmd := exec.Command(
			"adb", "-s", deviceID, "shell",
			"su", "-c", fmt.Sprintf("sh %s", scriptPath),
		)
		suOut, suErr := suCmd.CombinedOutput()
		suOutput := string(suOut)
		if suErr != nil {
			return fmt.Errorf(
				"cert injection script failed: %s: %w",
				suOutput, suErr,
			)
		}
		output = suOutput
	}

	if !strings.Contains(output, "System cert successfully injected") {
		return fmt.Errorf("cert injection did not complete: %s", output)
	}

	_ = shell(deviceID, fmt.Sprintf("rm -f %s", scriptPath))

	return nil
}

func RemoveCACert(deviceID string, pemPath string) error {
	hash, err := certSubjectHash(pemPath)
	if err != nil {
		return err
	}

	remotePath := fmt.Sprintf("/system/etc/security/cacerts/%s.0", hash)
	_ = shell(deviceID, fmt.Sprintf("rm -f %s", remotePath))
	return nil
}

func certSubjectHash(pemPath string) (string, error) {
	cmd := exec.Command(
		"openssl",
		"x509",
		"-inform",
		"PEM",
		"-subject_hash_old",
		"-noout",
		"-in",
		pemPath,
	)
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("adb: openssl subject_hash_old: %w", err)
	}
	hash := strings.TrimSpace(string(out))
	if hash == "" {
		return "", fmt.Errorf("adb: empty subject hash for %s", pemPath)
	}
	return hash, nil
}

func ConvertToDER(pemPath string) ([]byte, error) {
	pemData, err := os.ReadFile(pemPath)
	if err != nil {
		return nil, err
	}

	block, _ := pem.Decode(pemData)
	if block == nil {
		return nil, fmt.Errorf("invalid PEM in %s", pemPath)
	}

	if _, err := x509.ParseCertificate(block.Bytes); err != nil {
		return nil, fmt.Errorf("invalid certificate: %w", err)
	}

	return block.Bytes, nil
}
