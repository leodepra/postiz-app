#!/bin/sh
set -eu
# Applications share this namespace but have no NET_ADMIN capability.
# Only the guard can configure it. The namespace exists before apps start.
iptables -P OUTPUT DROP
iptables -P FORWARD DROP
ip6tables -P OUTPUT DROP
ip6tables -P FORWARD DROP
iptables -F OUTPUT
iptables -A OUTPUT -d 127.0.0.11 -j REJECT
# Block embedded Docker DNS as well, before allowing loopback.
iptables -A OUTPUT -p udp --dport 53 -j REJECT
iptables -A OUTPUT -p tcp --dport 53 -j REJECT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -d 172.30.251.11 -p tcp --dport 5432 -j ACCEPT
iptables -A OUTPUT -d 172.30.251.12 -p tcp --dport 6379 -j ACCEPT
iptables -A OUTPUT -d 172.30.251.13 -p tcp --dport 7233 -j ACCEPT
iptables -A OUTPUT -d 172.30.251.14 -p tcp --dport 3128 -j ACCEPT
touch /tmp/ready
exec sleep infinity
