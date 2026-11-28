FROM andrius/asterisk:22

USER root
RUN mkdir -p /var/lib/asterisk/monosip /etc/asterisk /usr/share/monosip/asterisk-conf

# Seed path survives the base image's VOLUME /etc/asterisk (Compose reuses that
# anonymous volume across recreate and would otherwise keep stale modules.conf).
COPY conf/ /usr/share/monosip/asterisk-conf/
COPY conf/ /etc/asterisk/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
  && rm -f /etc/asterisk/users.conf /usr/share/monosip/asterisk-conf/users.conf

EXPOSE 5060/udp 5060/tcp 8088 8089 5038 10000-10100/udp

ENTRYPOINT ["/entrypoint.sh"]
