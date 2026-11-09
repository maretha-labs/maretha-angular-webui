package io.maretha.webui.server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.xpath.XPathFactory;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.nuxeo.common.xmap.XMap;
import org.nuxeo.ecm.platform.ui.web.auth.service.OpenUrlDescriptor;
import org.nuxeo.runtime.api.Framework;
import org.nuxeo.runtime.test.runner.Features;
import org.nuxeo.runtime.test.runner.FeaturesRunner;
import org.nuxeo.runtime.test.runner.RuntimeFeature;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

/** Parses the generated contribution with Nuxeo's native descriptor; no servlet host is started. */
@RunWith(FeaturesRunner.class)
@Features(RuntimeFeature.class)
public class DeliveryAuthenticationTest {

    protected static final String CONTEXT_PROPERTY = "org.nuxeo.ecm.contextPath";
    protected static final String TOKEN = "A".repeat(43);
    protected String previousContext;

    @Before
    public void saveContext() {
        previousContext = Framework.getProperties().getProperty(CONTEXT_PROPERTY);
    }

    @After
    public void restoreContext() {
        if (previousContext == null) Framework.getProperties().remove(CONTEXT_PROPERTY);
        else Framework.getProperties().setProperty(CONTEXT_PROPERTY, previousContext);
    }

    @Test
    public void nativeDescriptorsOpenOnlyTheExactGetAndHeadContentPaths() throws Exception {
        for (String context : List.of("", "/nuxeo", "/nuxeo.test")) {
            Framework.getProperties().setProperty(CONTEXT_PROPERTY, context);
            List<OpenUrlDescriptor> descriptors = descriptors();
            assertEquals(2, descriptors.size());
            assertEquals(List.of("GET", "HEAD"), descriptors.stream().map(OpenUrlDescriptor::getMethod).toList());
            String content = context + DeliveryServlet.BASE_PATH + "/content/" + TOKEN;
            for (String method : List.of("GET", "HEAD")) {
                assertTrue(context + " " + method, bypass(descriptors, method, content));
            }
            for (String method : List.of("POST", "DELETE", "PUT", "OPTIONS", "PATCH", "get")) {
                assertFalse(context + " " + method, bypass(descriptors, method, content));
            }
        }
    }

    @Test
    public void encodedAliasesSiblingApplicationsAndPrefixMatchesCannotBypass() throws Exception {
        Framework.getProperties().setProperty(CONTEXT_PROPERTY, "/nuxeo.test");
        List<OpenUrlDescriptor> descriptors = descriptors();
        String base = "/nuxeo.test" + DeliveryServlet.BASE_PATH + "/content/";
        for (String path : List.of(base + TOKEN + "/", base + TOKEN + "/extra", base + "A".repeat(42),
                base + "A".repeat(44), base + "%41" + "A".repeat(42), base + TOKEN + ";x=1",
                base.replace("nuxeo.test", "nuxeoXtest") + TOKEN,
                base.replace(DeliveryServlet.BASE_PATH, "/other-delivery/v1") + TOKEN,
                "/prefix" + base + TOKEN, base + "../" + TOKEN)) {
            assertFalse(path, bypass(descriptors, "GET", path));
            assertFalse(path, bypass(descriptors, "HEAD", path));
        }
    }

    @Test
    public void grantAndSessionManagementAlwaysRemainUnderNormalAuthentication() throws Exception {
        Framework.getProperties().setProperty(CONTEXT_PROPERTY, "/nuxeo");
        List<OpenUrlDescriptor> descriptors = descriptors();
        for (String method : List.of("GET", "HEAD", "POST", "DELETE")) {
            for (String path : List.of("/grants", "/grants/" + TOKEN, "/grants/" + TOKEN + "/renew", "/session")) {
                assertFalse(method + " " + path,
                        bypass(descriptors, method, "/nuxeo" + DeliveryServlet.BASE_PATH + path));
            }
        }
        Document xml = xml("OSGI-INF/delivery.xml");
        assertEquals("1", query(xml, "count(/component/extension)"));
        assertEquals("openUrl", query(xml, "/component/extension/@point"));
        assertEquals("org.nuxeo.ecm.platform.ui.web.auth.service.PluggableAuthenticationService",
                query(xml, "/component/extension/@target"));
        assertEquals("org.nuxeo.ecm.platform.ui.web.auth.defaultConfig", query(xml, "/component/require"));
    }

    @Test
    public void deploymentFragmentMapsTheEntireServletThroughTheStandardAuthFilter() throws Exception {
        Document xml = xml("OSGI-INF/deployment-fragment.xml");
        String servlet = "/fragment/extension[@target='web#SERVLET']";
        String filter = "/fragment/extension[@target='web#STD-AUTH-FILTER']/filter-mapping";
        assertEquals("1", query(xml, "/fragment/@version"));
        assertEquals("2", query(xml, "count(/fragment/extension)"));
        assertEquals(DeliveryServlet.class.getName(), query(xml, servlet + "/servlet/servlet-class"));
        assertEquals(query(xml, servlet + "/servlet/servlet-name"),
                query(xml, servlet + "/servlet-mapping/servlet-name"));
        assertEquals(DeliveryServlet.BASE_PATH + "/*", query(xml, servlet + "/servlet-mapping/url-pattern"));
        assertEquals("NuxeoAuthenticationFilter", query(xml, filter + "/filter-name"));
        assertEquals(DeliveryServlet.BASE_PATH + "/*", query(xml, filter + "/url-pattern"));
        assertEquals("2", query(xml, "count(" + filter + "/dispatcher)"));
        assertEquals("REQUEST", query(xml, filter + "/dispatcher[1]"));
        assertEquals("FORWARD", query(xml, filter + "/dispatcher[2]"));
    }

    protected List<OpenUrlDescriptor> descriptors() throws Exception {
        var nodes = xml("OSGI-INF/delivery.xml").getElementsByTagName("openUrl");
        XMap mapper = new XMap();
        mapper.register(OpenUrlDescriptor.class);
        List<OpenUrlDescriptor> descriptors = new ArrayList<>();
        for (int index = 0; index < nodes.getLength(); index++) {
            descriptors.add((OpenUrlDescriptor) mapper.load((Element) nodes.item(index)));
        }
        return descriptors;
    }

    protected boolean bypass(List<OpenUrlDescriptor> descriptors, String method, String uri) {
        HttpServletRequest request = DeliveryServletTest.proxy(HttpServletRequest.class,
                (proxy, called, args) -> switch (called.getName()) {
                    case "getMethod" -> method;
                    case "getRequestURI" -> uri;
                    default -> throw new AssertionError("Unexpected matching input: " + called.getName());
                });
        return descriptors.stream().anyMatch(descriptor -> descriptor.allowByPassAuth(request));
    }

    protected Document xml(String name) throws Exception {
        var resource = getClass().getClassLoader().getResource(name);
        assertNotNull(name, resource);
        var factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        try (var stream = resource.openStream()) {
            return factory.newDocumentBuilder().parse(stream);
        }
    }

    protected String query(Document document, String expression) throws Exception {
        return XPathFactory.newInstance().newXPath().evaluate(expression, document).trim();
    }
}
